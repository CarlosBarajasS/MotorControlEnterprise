using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// HttpClient para proxying de streams HLS desde central-mediamtx
builder.Services.AddHttpClient("mediamtx", client =>
{
    client.Timeout = TimeSpan.FromSeconds(10);
});

// Seeder: crea el primer admin desde env vars (corre antes que MQTT)
builder.Services.AddHostedService<MotorControlEnterprise.Api.Services.AdminSeederService>();
// MQTT: suscripción a topics de edge gateways
builder.Services.AddHostedService<MotorControlEnterprise.Api.Services.MqttIntegrationService>();

// Configure Entity Framework
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// Configure JWT Authentication
var jwtKey = builder.Configuration["Jwt:Key"] ?? "super_secret_key_change_in_production_motor_control_enterprise_2026_xyz";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "MotorControlAPI",
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "MotorControlEdge",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

var app = builder.Build();

// Configure the HTTP request pipeline.
// Swagger disponible siempre en esta etapa de desarrollo
app.UseSwagger();
app.UseSwaggerUI();

// Use Cors, Auth & Controllers
app.UseCors(builder => builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
