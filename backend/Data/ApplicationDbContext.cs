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
        public DbSet<Camera> Cameras { get; set; } = null!;
        public DbSet<MotorTelemetry> MotorTelemetry { get; set; } = null!;
        public DbSet<Recording> Recordings { get; set; } = null!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // --- User ---
            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email).IsUnique();

            // --- Client ---
            modelBuilder.Entity<Client>()
                .HasIndex(c => c.Name).IsUnique();

            modelBuilder.Entity<Client>()
                .HasIndex(c => c.GatewayId).IsUnique();

            modelBuilder.Entity<Client>()
                .HasOne(c => c.User)
                .WithMany(u => u.Clients)
                .HasForeignKey(c => c.UserId)
                .OnDelete(DeleteBehavior.SetNull);

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
        }
    }
}
