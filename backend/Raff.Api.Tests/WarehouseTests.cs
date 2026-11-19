using System.Net;
using System.Net.Http.Json;
using Raff.Api.Domain;
using Raff.Api.Dtos;

namespace Raff.Api.Tests;

[Collection("api")]
public class WarehouseTests(ApiFixture api)
{
    private static string Today => DateTime.UtcNow.ToString("yyyy-MM-dd");

    [Fact]
    public async Task A_transfer_moves_stock_between_warehouses_and_records_both_legs()
    {
        var admin = await api.ClientFor("admin");
        var branch = await TestData.CreateWarehouse(admin);
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 20);

        var res = await TestData.Transfer(admin, product.Id, 8, TestData.MainWarehouseId, branch.Id);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var stock = (await admin.GetFromJsonAsync<List<ProductStockDto>>($"/api/products/{product.Id}/stock", ApiFixture.Json))!;
        Assert.Equal(12, stock.Single(s => s.WarehouseId == TestData.MainWarehouseId).Quantity);
        Assert.Equal(8, stock.Single(s => s.WarehouseId == branch.Id).Quantity);
        Assert.Equal(20, (await TestData.GetProduct(admin, product.Id)).Quantity); // the total doesn't change

        var legs = (await admin.GetFromJsonAsync<PagedResult<MovementDto>>(
            $"/api/movements?productId={product.Id}&type=Transfer", ApiFixture.Json))!.Items;
        Assert.Equal(2, legs.Count);
        var outLeg = legs.Single(m => m.Type == MovementType.TransferOut);
        var inLeg = legs.Single(m => m.Type == MovementType.TransferIn);
        Assert.Equal(outLeg.TransferId, inLeg.TransferId);
        Assert.Equal((-8, 12, branch.Id), (outLeg.QuantityChange, outLeg.BalanceAfter, outLeg.CounterpartWarehouseId!.Value));
        Assert.Equal((8, 8, TestData.MainWarehouseId), (inLeg.QuantityChange, inLeg.BalanceAfter, inLeg.CounterpartWarehouseId!.Value));
    }

    [Fact]
    public async Task A_transfer_larger_than_the_source_stock_changes_nothing()
    {
        var admin = await api.ClientFor("admin");
        var branch = await TestData.CreateWarehouse(admin);
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 5);

        var res = await TestData.Transfer(admin, product.Id, 6, TestData.MainWarehouseId, branch.Id);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(5, (await TestData.GetProduct(admin, product.Id, TestData.MainWarehouseId)).Quantity);
        Assert.Equal(0, (await TestData.GetProduct(admin, product.Id, branch.Id)).Quantity);
    }

    [Fact]
    public async Task A_transfer_needs_two_different_warehouses()
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 5);

        var res = await TestData.Transfer(admin, product.Id, 1, TestData.MainWarehouseId, TestData.MainWarehouseId);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Stock_out_is_checked_against_the_chosen_warehouse_not_the_total()
    {
        var admin = await api.ClientFor("admin");
        var branch = await TestData.CreateWarehouse(admin);
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 10);
        await TestData.Transfer(admin, product.Id, 6, TestData.MainWarehouseId, branch.Id);

        var tooMuch = await TestData.Move(admin, product.Id, MovementType.Out, 7, warehouseId: branch.Id);
        var fine = await TestData.Move(admin, product.Id, MovementType.Out, 5, warehouseId: branch.Id);

        Assert.Equal(HttpStatusCode.BadRequest, tooMuch.StatusCode);
        Assert.Equal(HttpStatusCode.OK, fine.StatusCode);
        var branchProduct = await TestData.GetProduct(admin, product.Id, branch.Id);
        Assert.Equal(1, branchProduct.Quantity);
        Assert.Equal(StockStatus.Low, branchProduct.Status); // reorder level 5 applies per warehouse
    }

    [Fact]
    public async Task A_storekeeper_limited_to_one_warehouse_cannot_see_or_change_another()
    {
        var admin = await api.ClientFor("admin");
        var keeper = await api.ClientFor("keeper"); // seeded as limited to MAIN
        var branch = await TestData.CreateWarehouse(admin);
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 10);

        var visible = (await keeper.GetFromJsonAsync<List<WarehouseDto>>("/api/warehouses", ApiFixture.Json))!;
        Assert.Equal(new[] { TestData.MainWarehouseId }, visible.Select(w => w.Id));
        Assert.Equal(HttpStatusCode.Forbidden, (await keeper.GetAsync($"/api/products?warehouseId={branch.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await TestData.Move(keeper, product.Id, MovementType.In, 1, warehouseId: branch.Id)).StatusCode);

        // ...but they may send stock from their own warehouse to another one.
        Assert.Equal(HttpStatusCode.OK, (await TestData.Transfer(keeper, product.Id, 3, TestData.MainWarehouseId, branch.Id)).StatusCode);
        Assert.Equal(3, (await TestData.GetProduct(admin, product.Id, branch.Id)).Quantity);
    }

    [Fact]
    public async Task Transfers_are_not_counted_as_sales_or_purchases()
    {
        var admin = await api.ClientFor("admin");
        var branch = await TestData.CreateWarehouse(admin);
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 10);
        var url = $"/api/reports/summary?from={Today}&to={Today}&tz=0";
        var before = (await admin.GetFromJsonAsync<RangeSummary>(url, ApiFixture.Json))!;

        await TestData.Transfer(admin, product.Id, 4, TestData.MainWarehouseId, branch.Id);

        var after = (await admin.GetFromJsonAsync<RangeSummary>(url, ApiFixture.Json))!;
        Assert.Equal(before.Revenue, after.Revenue);
        Assert.Equal(before.PurchasesValue, after.PurchasesValue);
        Assert.Equal(before.UnitsIn, after.UnitsIn);
        Assert.Equal(before.UnitsOut, after.UnitsOut);
    }

    [Fact]
    public async Task Dashboard_figures_can_be_limited_to_one_warehouse()
    {
        var admin = await api.ClientFor("admin");
        var branch = await TestData.CreateWarehouse(admin);
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 10, cost: 3m);
        await TestData.Transfer(admin, product.Id, 4, TestData.MainWarehouseId, branch.Id);

        var summary = (await admin.GetFromJsonAsync<DashboardSummary>($"/api/dashboard/summary?warehouseId={branch.Id}", ApiFixture.Json))!;

        Assert.Equal(4, summary.TotalUnits);
        Assert.Equal(12m, summary.StockValueCost);
        var warehouses = (await admin.GetFromJsonAsync<List<WarehouseDto>>("/api/warehouses", ApiFixture.Json))!;
        Assert.Equal(4, warehouses.Single(w => w.Id == branch.Id).Units);
    }

    [Fact]
    public async Task A_warehouse_holding_stock_cannot_be_deactivated()
    {
        var admin = await api.ClientFor("admin");
        var branch = await TestData.CreateWarehouse(admin);
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 3);
        await TestData.Transfer(admin, product.Id, 2, TestData.MainWarehouseId, branch.Id);

        var res = await admin.DeleteAsync($"/api/warehouses/{branch.Id}");

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    [Fact]
    public async Task An_unused_warehouse_is_deleted_and_one_with_history_is_archived()
    {
        var admin = await api.ClientFor("admin");
        var unused = await TestData.CreateWarehouse(admin);
        var used = await TestData.CreateWarehouse(admin);
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 3);
        await TestData.Transfer(admin, product.Id, 2, TestData.MainWarehouseId, used.Id);
        await TestData.Transfer(admin, product.Id, 2, used.Id, TestData.MainWarehouseId); // empty it again

        await admin.DeleteAsync($"/api/warehouses/{unused.Id}");
        await admin.DeleteAsync($"/api/warehouses/{used.Id}");

        var all = (await admin.GetFromJsonAsync<List<WarehouseDto>>("/api/warehouses?includeInactive=true", ApiFixture.Json))!;
        Assert.DoesNotContain(all, w => w.Id == unused.Id);
        Assert.False(all.Single(w => w.Id == used.Id).IsActive);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestData.Move(admin, product.Id, MovementType.In, 1, warehouseId: used.Id)).StatusCode);
    }

    [Fact]
    public async Task Only_users_with_the_permission_can_manage_warehouses()
    {
        var viewer = await api.ClientFor("viewer");
        var keeper = await api.ClientFor("keeper");
        var input = new WarehouseInput("NOPE", "Not allowed", null);

        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.PostAsJsonAsync("/api/warehouses", input, ApiFixture.Json)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await keeper.PostAsJsonAsync("/api/warehouses", input, ApiFixture.Json)).StatusCode);
    }
}
