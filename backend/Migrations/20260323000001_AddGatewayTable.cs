using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace MotorControlEnterprise.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGatewayTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Gateways",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ClientId = table.Column<int>(type: "integer", nullable: false),
                    GatewayId = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Location = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "active"),
                    Metadata = table.Column<string>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastHeartbeatAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Gateways", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Gateways_Clients_ClientId",
                        column: x => x.ClientId,
                        principalTable: "Clients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Gateways_GatewayId",
                table: "Gateways",
                column: "GatewayId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Gateways_ClientId",
                table: "Gateways",
                column: "ClientId");

            // Data migration: preserve existing gateways from Client.GatewayId
            migrationBuilder.Sql(@"
                INSERT INTO ""Gateways"" (""ClientId"", ""GatewayId"", ""Name"", ""Status"", ""Metadata"", ""CreatedAt"", ""UpdatedAt"", ""LastHeartbeatAt"")
                SELECT
                    ""Id"",
                    ""GatewayId"",
                    ""Name"" || ' - Gateway',
                    'active',
                    ""Metadata"",
                    NOW(),
                    NOW(),
                    ""last_heartbeat_at""
                FROM ""Clients""
                WHERE ""GatewayId"" IS NOT NULL AND ""GatewayId"" != '';
            ");

            // Drop old gateway columns from Clients
            migrationBuilder.DropIndex(
                name: "IX_Clients_GatewayId",
                table: "Clients");

            migrationBuilder.DropColumn(
                name: "GatewayId",
                table: "Clients");

            migrationBuilder.DropColumn(
                name: "last_heartbeat_at",
                table: "Clients");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Re-add columns to Clients
            migrationBuilder.AddColumn<string>(
                name: "GatewayId",
                table: "Clients",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "last_heartbeat_at",
                table: "Clients",
                type: "timestamp with time zone",
                nullable: true);

            // Restore data from Gateways (first gateway per client)
            migrationBuilder.Sql(@"
                UPDATE ""Clients"" c
                SET ""GatewayId"" = g.""GatewayId"",
                    ""last_heartbeat_at"" = g.""LastHeartbeatAt""
                FROM (
                    SELECT DISTINCT ON (""ClientId"") ""ClientId"", ""GatewayId"", ""LastHeartbeatAt""
                    FROM ""Gateways""
                    ORDER BY ""ClientId"", ""Id""
                ) g
                WHERE c.""Id"" = g.""ClientId"";
            ");

            migrationBuilder.CreateIndex(
                name: "IX_Clients_GatewayId",
                table: "Clients",
                column: "GatewayId",
                unique: true);

            migrationBuilder.DropTable(name: "Gateways");
        }
    }
}
