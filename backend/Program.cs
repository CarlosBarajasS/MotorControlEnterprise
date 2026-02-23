using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(opts =>
        opts.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// HttpClient — mediamtx proxy + Resend.dev email
builder.Services.AddHttpClient("mediamtx", (sp, client) =>
{
    client.Timeout = TimeSpan.FromSeconds(10);

    // Basic auth para acceder a central-mediamtx (lectura HLS/WebRTC)
    var cfg  = sp.GetRequiredService<IConfiguration>();
    var user = cfg["Mediamtx:User"];
    var pass = cfg["Mediamtx:Password"];
    if (!string.IsNullOrEmpty(user))
    {
        var creds = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"{user}:{pass}"));
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", creds);
    }
});
builder.Services.AddHttpClient();  // default factory para ResendEmailService

// Email service (Resend.dev) — alertas de cámaras
builder.Services.AddScoped<MotorControlEnterprise.Api.Services.IEmailService,
                            MotorControlEnterprise.Api.Services.ResendEmailService>();

// Seeder: crea el primer admin desde env vars (corre antes que MQTT)
builder.Services.AddHostedService<MotorControlEnterprise.Api.Services.AdminSeederService>();
// CameraEdgeService: request-response MQTT para PTZ, SD card y grabaciones locales
builder.Services.AddSingleton<MotorControlEnterprise.Api.Services.ICameraEdgeService,
                               MotorControlEnterprise.Api.Services.CameraEdgeService>();
// MQTT Publisher: singleton inyectable en controllers para publicar comandos
builder.Services.AddSingleton<MotorControlEnterprise.Api.Services.IMqttPublisherService,
                               MotorControlEnterprise.Api.Services.MqttPublisherService>();
builder.Services.AddHostedService(sp =>
    (MotorControlEnterprise.Api.Services.MqttPublisherService)
    sp.GetRequiredService<MotorControlEnterprise.Api.Services.IMqttPublisherService>());
// MQTT Integration: suscripción a topics de edge gateways
builder.Services.AddHostedService<MotorControlEnterprise.Api.Services.MqttIntegrationService>();
// Stream Recorder: grabación continua de cámaras con cloud storage activo
builder.Services.AddHostedService<MotorControlEnterprise.Api.Services.StreamRecorderService>();
// Storage Cleaner: limpieza diaria de grabaciones antiguas en NAS
builder.Services.AddHostedService<MotorControlEnterprise.Api.Services.StorageCleanerService>();

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

        // Permite pasar el token como query param ?token=... para endpoints de video
        // (el elemento <video src> no puede enviar headers de Authorization)
        options.Events = new Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["token"].FirstOrDefault();
                if (!string.IsNullOrEmpty(token))
                    ctx.Token = token;
                return Task.CompletedTask;
            }
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
