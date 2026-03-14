using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MotorControlEnterprise.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGinIndexClientMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"CREATE INDEX CONCURRENTLY IF NOT EXISTS ""IX_Clients_Metadata_gin"" ON ""Clients"" USING GIN (""Metadata"" jsonb_path_ops);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"DROP INDEX IF EXISTS ""IX_Clients_Metadata_gin"";");
        }
    }
}
