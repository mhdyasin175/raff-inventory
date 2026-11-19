using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Raff.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class MultiWarehouse : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "WarehouseId",
                table: "Users",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CounterpartWarehouseId",
                table: "StockMovements",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TransferId",
                table: "StockMovements",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "WarehouseId",
                table: "StockMovements",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "Warehouses",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Code = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Address = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Warehouses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StockLevels",
                columns: table => new
                {
                    ProductId = table.Column<int>(type: "int", nullable: false),
                    WarehouseId = table.Column<int>(type: "int", nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockLevels", x => new { x.ProductId, x.WarehouseId });
                    table.CheckConstraint("CK_StockLevel_Quantity", "[Quantity] >= 0");
                    table.ForeignKey(
                        name: "FK_StockLevels_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_StockLevels_Warehouses_WarehouseId",
                        column: x => x.WarehouseId,
                        principalTable: "Warehouses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            // ---- Move existing data into the multi-warehouse model (before Products.Quantity is dropped
            //      and before the warehouse foreign keys are added) ----

            // 1. Every existing database gets the main warehouse; all current stock and history belong to it.
            migrationBuilder.Sql(@"
INSERT INTO [Warehouses] ([Code], [Name], [Address], [IsActive], [CreatedAt])
VALUES (N'MAIN', N'المستودع الرئيسي', N'دمشق، المنطقة الصناعية', 1, SYSUTCDATETIME());");

            // 2. Each product's on-hand quantity becomes its stock level in the main warehouse.
            migrationBuilder.Sql(@"
INSERT INTO [StockLevels] ([ProductId], [WarehouseId], [Quantity])
SELECT p.[Id], w.[Id], p.[Quantity]
FROM [Products] p CROSS JOIN [Warehouses] w
WHERE w.[Code] = N'MAIN' AND p.[Quantity] > 0;");

            // 3. Past movements happened in the main warehouse.
            migrationBuilder.Sql(@"
UPDATE [StockMovements] SET [WarehouseId] = (SELECT [Id] FROM [Warehouses] WHERE [Code] = N'MAIN');");

            // 4. Existing roles get the new permissions that match what they could already do:
            //    whoever could adjust stock may also transfer and manage warehouses; whoever could receive stock may transfer.
            migrationBuilder.Sql(@"
INSERT INTO [RolePermissions] ([RoleId], [Permission])
SELECT r.[RoleId], v.[Permission]
FROM (SELECT DISTINCT [RoleId] FROM [RolePermissions] WHERE [Permission] = N'movements.adjust') r
CROSS JOIN (VALUES (N'movements.transfer'), (N'warehouses.manage')) v([Permission])
WHERE NOT EXISTS (SELECT 1 FROM [RolePermissions] x WHERE x.[RoleId] = r.[RoleId] AND x.[Permission] = v.[Permission]);

INSERT INTO [RolePermissions] ([RoleId], [Permission])
SELECT DISTINCT rp.[RoleId], N'movements.transfer'
FROM [RolePermissions] rp
WHERE rp.[Permission] = N'movements.in'
  AND NOT EXISTS (SELECT 1 FROM [RolePermissions] x WHERE x.[RoleId] = rp.[RoleId] AND x.[Permission] = N'movements.transfer');");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Product_Quantity",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "Quantity",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "RowVersion",
                table: "Products");

            migrationBuilder.CreateIndex(
                name: "IX_Users_WarehouseId",
                table: "Users",
                column: "WarehouseId");

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_CounterpartWarehouseId",
                table: "StockMovements",
                column: "CounterpartWarehouseId");

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_TransferId",
                table: "StockMovements",
                column: "TransferId");

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_WarehouseId_OccurredAt",
                table: "StockMovements",
                columns: new[] { "WarehouseId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StockLevels_WarehouseId",
                table: "StockLevels",
                column: "WarehouseId");

            migrationBuilder.CreateIndex(
                name: "IX_Warehouses_Code",
                table: "Warehouses",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Warehouses_Name",
                table: "Warehouses",
                column: "Name",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_StockMovements_Warehouses_CounterpartWarehouseId",
                table: "StockMovements",
                column: "CounterpartWarehouseId",
                principalTable: "Warehouses",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_StockMovements_Warehouses_WarehouseId",
                table: "StockMovements",
                column: "WarehouseId",
                principalTable: "Warehouses",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Users_Warehouses_WarehouseId",
                table: "Users",
                column: "WarehouseId",
                principalTable: "Warehouses",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StockMovements_Warehouses_CounterpartWarehouseId",
                table: "StockMovements");

            migrationBuilder.DropForeignKey(
                name: "FK_StockMovements_Warehouses_WarehouseId",
                table: "StockMovements");

            migrationBuilder.DropForeignKey(
                name: "FK_Users_Warehouses_WarehouseId",
                table: "Users");

            migrationBuilder.AddColumn<int>(
                name: "Quantity",
                table: "Products",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql(@"
UPDATE p SET [Quantity] = ISNULL((SELECT SUM(s.[Quantity]) FROM [StockLevels] s WHERE s.[ProductId] = p.[Id]), 0)
FROM [Products] p;");

            migrationBuilder.DropTable(
                name: "StockLevels");

            migrationBuilder.DropTable(
                name: "Warehouses");

            migrationBuilder.DropIndex(
                name: "IX_Users_WarehouseId",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_StockMovements_CounterpartWarehouseId",
                table: "StockMovements");

            migrationBuilder.DropIndex(
                name: "IX_StockMovements_TransferId",
                table: "StockMovements");

            migrationBuilder.DropIndex(
                name: "IX_StockMovements_WarehouseId_OccurredAt",
                table: "StockMovements");

            migrationBuilder.DropColumn(
                name: "WarehouseId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "CounterpartWarehouseId",
                table: "StockMovements");

            migrationBuilder.DropColumn(
                name: "TransferId",
                table: "StockMovements");

            migrationBuilder.DropColumn(
                name: "WarehouseId",
                table: "StockMovements");

            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                table: "Products",
                type: "rowversion",
                rowVersion: true,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Product_Quantity",
                table: "Products",
                sql: "[Quantity] >= 0");
        }
    }
}
