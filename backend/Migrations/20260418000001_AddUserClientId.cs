using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MotorControlEnterprise.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUserClientId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "client_id",
                table: "Users",
                type: "integer",
                nullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Users_Clients_client_id",
                table: "Users",
                column: "client_id",
                principalTable: "Clients",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.CreateIndex(
                name: "idx_users_client_email_unique",
                table: "Users",
                columns: new[] { "client_id", "Email" },
                unique: true,
                filter: "client_id IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "idx_users_client_email_unique",
                table: "Users");

            migrationBuilder.DropForeignKey(
                name: "FK_Users_Clients_client_id",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "client_id",
                table: "Users");
        }
    }
}
