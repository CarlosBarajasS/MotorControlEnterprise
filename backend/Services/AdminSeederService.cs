using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;

namespace MotorControlEnterprise.Api.Services
{
    /// <summary>
    /// Crea el primer usuario admin al iniciar si no existe ninguno.
    /// Credenciales leídas de variables de entorno ADMIN_EMAIL y ADMIN_PASSWORD.
    /// </summary>
    public class AdminSeederService : IHostedService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<AdminSeederService> _logger;
        private readonly IConfiguration _config;

        public AdminSeederService(
            IServiceProvider serviceProvider,
            ILogger<AdminSeederService> logger,
            IConfiguration config)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
            _config = config;
        }

        public async Task StartAsync(CancellationToken cancellationToken)
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // Aplicar migraciones / crear esquema si no existe
            await db.Database.EnsureCreatedAsync(cancellationToken);

            // Si ya existe al menos un admin, no hacer nada
            if (await db.Users.AnyAsync(u => u.Role == "admin", cancellationToken))
            {
                _logger.LogInformation("Seeder: ya existe un usuario admin, omitiendo.");
                return;
            }

            var email    = _config["Seed:AdminEmail"]    ?? "admin@motorcontrol.com";
            var password = _config["Seed:AdminPassword"];

            if (string.IsNullOrWhiteSpace(password))
            {
                _logger.LogWarning(
                    "Seeder: ADMIN_PASSWORD no configurado. " +
                    "Define Seed__AdminPassword en el .env para crear el primer admin automáticamente.");
                return;
            }

            var admin = new User
            {
                Email        = email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
                Name         = "Administrador",
                Role         = "admin",
                IsActive     = true,
                CreatedAt    = DateTime.UtcNow,
                UpdatedAt    = DateTime.UtcNow
            };

            db.Users.Add(admin);
            await db.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Seeder: admin creado con email {Email}.", email);
            _logger.LogWarning(
                "Seeder: elimina Seed__AdminPassword del .env una vez iniciada sesión por primera vez.");
        }

        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
