using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using System.Text.Json;

namespace MotorControlEnterprise.Api.Middleware
{
    public class EdgeTokenAuthMiddleware
    {
        private readonly RequestDelegate _next;

        public EdgeTokenAuthMiddleware(RequestDelegate next) => _next = next;

        public async Task InvokeAsync(HttpContext context, ApplicationDbContext db)
        {
            // Only apply to /api/edge/ routes
            if (!context.Request.Path.StartsWithSegments("/api/edge"))
            {
                await _next(context);
                return;
            }

            var token = context.Request.Headers["X-Edge-Token"].FirstOrDefault();
            if (string.IsNullOrEmpty(token))
            {
                context.Response.StatusCode = 401;
                await context.Response.WriteAsJsonAsync(new { message = "X-Edge-Token required" });
                return;
            }

            // Find client with matching edgeToken in Metadata JSONB
            // Use JsonSerializer to safely build the JSON contains clause (prevents injection)
            var containsJson = JsonSerializer.Serialize(new { edgeToken = token });
            var client = await db.Clients
                .Where(c => EF.Functions.JsonContains(c.Metadata!, containsJson))
                .FirstOrDefaultAsync();

            if (client == null)
            {
                context.Response.StatusCode = 401;
                await context.Response.WriteAsJsonAsync(new { message = "Invalid edge token" });
                return;
            }

            // Store client in HttpContext for controllers to use
            context.Items["EdgeClient"] = client;
            await _next(context);
        }
    }
}
