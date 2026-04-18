using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Models;

namespace MotorControlEnterprise.Api.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<User> Users { get; set; } = null!;
        public DbSet<Client> Clients { get; set; } = null!;
        public DbSet<Gateway> Gateways { get; set; } = null!;
        public DbSet<Camera> Cameras { get; set; } = null!;
        public DbSet<MotorTelemetry> MotorTelemetry { get; set; } = null!;
        public DbSet<Recording> Recordings { get; set; } = null!;
        public DbSet<Alert> Alerts { get; set; } = null!;
        public DbSet<AlertPreference> AlertPreferences { get; set; } = null!;
        public DbSet<ClientLayout> ClientLayouts { get; set; } = null!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // --- User ---
            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email).IsUnique();

            modelBuilder.Entity<User>()
                .HasOne(u => u.Client)
                .WithMany()
                .HasForeignKey(u => u.ClientId)
                .OnDelete(DeleteBehavior.Cascade);

            // Email único dentro del mismo tenant
            modelBuilder.Entity<User>()
                .HasIndex(u => new { u.ClientId, u.Email })
                .HasFilter("client_id IS NOT NULL")
                .IsUnique()
                .HasDatabaseName("idx_users_client_email_unique");

            // --- Client ---
            modelBuilder.Entity<Client>()
                .HasIndex(c => c.Name).IsUnique();

            modelBuilder.Entity<Client>()
                .HasOne(c => c.User)
                .WithMany(u => u.Clients)
                .HasForeignKey(c => c.UserId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<Client>()
                .HasMany(c => c.Gateways)
                .WithOne(g => g.Client)
                .HasForeignKey(g => g.ClientId)
                .OnDelete(DeleteBehavior.Cascade);

            // --- Gateway ---
            modelBuilder.Entity<Gateway>()
                .HasIndex(g => g.GatewayId).IsUnique();

            modelBuilder.Entity<Gateway>()
                .Property(g => g.Metadata)
                .HasColumnType("jsonb");

            // --- Camera ---
            modelBuilder.Entity<Camera>()
                .HasOne(c => c.User)
                .WithMany(u => u.Cameras)
                .HasForeignKey(c => c.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Camera>()
                .HasOne(c => c.Client)
                .WithMany()
                .HasForeignKey(c => c.ClientId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<Camera>()
                .HasIndex(c => c.ClientId);

            modelBuilder.Entity<Camera>()
                .HasIndex(c => c.LastSeen);

            // --- MotorTelemetry ---
            modelBuilder.Entity<MotorTelemetry>()
                .HasIndex(m => new { m.DeviceId, m.Timestamp });

            modelBuilder.Entity<MotorTelemetry>()
                .HasIndex(m => m.Timestamp);

            // --- Recording ---
            modelBuilder.Entity<Recording>()
                .HasOne(r => r.User)
                .WithMany()
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Recording>()
                .HasOne(r => r.Camera)
                .WithMany()
                .HasForeignKey(r => r.CameraId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Recording>()
                .HasIndex(r => r.UserId);

            modelBuilder.Entity<Recording>()
                .HasIndex(r => r.CameraId);

            modelBuilder.Entity<Recording>()
                .HasIndex(r => r.EndedAt);

            // --- Alert ---
            modelBuilder.Entity<Alert>()
                .HasIndex(a => new { a.Fingerprint, a.Status });

            modelBuilder.Entity<Alert>()
                .HasIndex(a => a.Status);

            modelBuilder.Entity<Alert>()
                .HasOne(a => a.Client)
                .WithMany()
                .HasForeignKey(a => a.ClientId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<Alert>()
                .Property(a => a.Priority)
                .HasConversion<int>();

            modelBuilder.Entity<Alert>()
                .Property(a => a.Status)
                .HasConversion<string>();

            modelBuilder.Entity<Alert>()
                .Property(a => a.EntityType)
                .HasConversion<string>();

            modelBuilder.Entity<Alert>()
                .Property(a => a.AlertType)
                .HasConversion<string>();

            // --- AlertPreference ---
            modelBuilder.Entity<AlertPreference>()
                .HasOne(p => p.Client)
                .WithMany()
                .HasForeignKey(p => p.ClientId)
                .OnDelete(DeleteBehavior.Cascade);

            // --- ClientLayout ---
            modelBuilder.Entity<ClientLayout>()
                .HasOne(l => l.Client)
                .WithMany()
                .HasForeignKey(l => l.ClientId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<ClientLayout>()
                .HasIndex(l => l.ClientId)
                .HasDatabaseName("idx_client_layouts_client");

            modelBuilder.Entity<ClientLayout>()
                .Property(l => l.Config)
                .HasColumnType("jsonb");
        }
    }
}
