using System.Net;
using System.Net.Http.Json;
using Raff.Api.Domain;
using Raff.Api.Dtos;

namespace Raff.Api.Tests;

[Collection("api")]
public class StockMovementTests(ApiFixture api)
{
    [Fact]
    public async Task Opening_quantity_is_recorded_as_the_first_stock_in()
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);

        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 12);

        Assert.Equal(12, product.Quantity);
        var history = await admin.GetFromJsonAsync<PagedResult<MovementDto>>($"/api/movements?productId={product.Id}", ApiFixture.Json);
        var first = Assert.Single(history!.Items);
        Assert.Equal(MovementType.In, first.Type);
        Assert.Equal(12, first.QuantityChange);
        Assert.Equal(12, first.BalanceAfter);
    }

    [Fact]
    public async Task Each_movement_updates_the_balance_and_stores_the_balance_after_it()
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id);

        var stockIn = await TestData.Move(admin, product.Id, MovementType.In, 10);
        var stockOut = await TestData.Move(admin, product.Id, MovementType.Out, 3);

        Assert.Equal(HttpStatusCode.OK, stockIn.StatusCode);
        Assert.Equal(HttpStatusCode.OK, stockOut.StatusCode);
        var outMove = (await stockOut.Content.ReadFromJsonAsync<MovementDto>(ApiFixture.Json))!;
        Assert.Equal(-3, outMove.QuantityChange);
        Assert.Equal(7, outMove.BalanceAfter);
        Assert.Equal(7, (await TestData.GetProduct(admin, product.Id)).Quantity);
    }

    [Fact]
    public async Task Stock_out_beyond_what_is_on_the_shelf_is_rejected_and_nothing_changes()
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 4);

        var res = await TestData.Move(admin, product.Id, MovementType.Out, 5);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(4, (await TestData.GetProduct(admin, product.Id)).Quantity);
    }

    [Fact]
    public async Task Adjustment_records_the_difference_between_counted_and_book_quantity()
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 20);

        var res = await TestData.Move(admin, product.Id, MovementType.Adjustment, 17, note: "3 damaged");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var move = (await res.Content.ReadFromJsonAsync<MovementDto>(ApiFixture.Json))!;
        Assert.Equal(-3, move.QuantityChange);
        Assert.Equal(17, (await TestData.GetProduct(admin, product.Id)).Quantity);
    }

    [Fact]
    public async Task Adjustment_needs_a_reason()
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 20);

        var res = await TestData.Move(admin, product.Id, MovementType.Adjustment, 18);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(20, (await TestData.GetProduct(admin, product.Id)).Quantity);
    }

    [Fact]
    public async Task Stock_status_follows_the_reorder_level()
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 10, reorderLevel: 5);
        Assert.Equal(StockStatus.Ok, product.Status);

        await TestData.Move(admin, product.Id, MovementType.Out, 6);
        Assert.Equal(StockStatus.Low, (await TestData.GetProduct(admin, product.Id)).Status);

        await TestData.Move(admin, product.Id, MovementType.Out, 4);
        Assert.Equal(StockStatus.Out, (await TestData.GetProduct(admin, product.Id)).Status);
    }

    [Fact]
    public async Task A_product_with_history_is_archived_instead_of_deleted()
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);
        var withHistory = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 1);
        var withoutHistory = await TestData.CreateProduct(admin, cat.Id);

        var archived = await admin.DeleteAsync($"/api/products/{withHistory.Id}");
        var deleted = await admin.DeleteAsync($"/api/products/{withoutHistory.Id}");

        Assert.Equal(HttpStatusCode.OK, archived.StatusCode);
        Assert.False((await TestData.GetProduct(admin, withHistory.Id)).IsActive);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/products/{withoutHistory.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);
    }

    [Fact]
    public async Task Archived_products_do_not_accept_movements()
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 5);
        await admin.DeleteAsync($"/api/products/{product.Id}");

        var res = await TestData.Move(admin, product.Id, MovementType.In, 1);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Duplicate_sku_is_rejected()
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);
        var first = await TestData.CreateProduct(admin, cat.Id);

        var res = await admin.PostAsJsonAsync("/api/products",
            new ProductInput(first.Sku, "Another name", cat.Id, "pcs", null, 1, 2, 1), ApiFixture.Json);

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }
}
