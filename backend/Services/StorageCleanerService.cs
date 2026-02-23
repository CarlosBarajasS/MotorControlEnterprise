namespace MotorControlEnterprise.Api.Services
{
    /// <summary>
    /// BackgroundService que ejecuta una vez al día y elimina carpetas de grabaciones
    /// más antiguas que el período de retención configurado.
    /// Estructura esperada: {nasPath}/{gatewayId}/{cameraId}/{YYYY-MM-DD}/
    /// </summary>
    public class StorageCleanerService : BackgroundService
    {
        private readonly IConfiguration _config;
        private readonly ILogger<StorageCleanerService> _logger;

        public StorageCleanerService(IConfiguration config, ILogger<StorageCleanerService> logger)
        {
            _config = config;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Primera ejecución: esperar 10 minutos después del arranque
            await Task.Delay(TimeSpan.FromMinutes(10), stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await CleanStorageAsync(stoppingToken);
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    _logger.LogError(ex, "StorageCleaner: error durante la limpieza");
                }

                // Ejecutar cada 24 horas
                await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
            }
        }

        private Task CleanStorageAsync(CancellationToken ct)
        {
            var nasPath       = _config["Storage:NasRecordingsPath"] ?? "/mnt/nas/recordings";
            var retentionDays = int.Parse(_config["StorageCleaner:RetentionDays"] ?? "30");
            var cutoffDate    = DateTime.UtcNow.AddDays(-retentionDays).ToString("yyyy-MM-dd");

            if (!Directory.Exists(nasPath))
            {
                _logger.LogWarning("StorageCleaner: directorio NAS no encontrado: {Path}", nasPath);
                return Task.CompletedTask;
            }

            long deletedFolders = 0;
            long freedBytes     = 0;

            // Recorrer {nasPath}/{gatewayId}/{cameraId}/{YYYY-MM-DD}/
            foreach (var gatewayDir in Directory.EnumerateDirectories(nasPath))
            {
                if (ct.IsCancellationRequested) break;

                foreach (var cameraDir in Directory.EnumerateDirectories(gatewayDir))
                {
                    if (ct.IsCancellationRequested) break;

                    foreach (var dateDir in Directory.EnumerateDirectories(cameraDir).ToList())
                    {
                        var dateName = Path.GetFileName(dateDir);

                        // Solo directorios con formato YYYY-MM-DD más antiguos que el cutoff
                        if (!System.Text.RegularExpressions.Regex.IsMatch(dateName, @"^\d{4}-\d{2}-\d{2}$"))
                            continue;

                        if (string.Compare(dateName, cutoffDate, StringComparison.Ordinal) >= 0)
                            continue;

                        try
                        {
                            var dirInfo = new DirectoryInfo(dateDir);
                            var bytes   = dirInfo.EnumerateFiles("*", SearchOption.AllDirectories)
                                                 .Sum(f => f.Length);

                            Directory.Delete(dateDir, recursive: true);
                            deletedFolders++;
                            freedBytes += bytes;
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "StorageCleaner: no se pudo eliminar {Dir}", dateDir);
                        }
                    }
                }
            }

            _logger.LogInformation(
                "StorageCleaner: eliminadas {Count} carpetas, liberados {Gb:F2} GB (retención {Days} días)",
                deletedFolders, freedBytes / 1024.0 / 1024.0 / 1024.0, retentionDays);

            return Task.CompletedTask;
        }
    }
}
