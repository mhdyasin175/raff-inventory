using System.Net.Http.Json;
using Raff.Api.Domain;
using Raff.Api.Dtos;

namespace Raff.Api.Tests;

/// <summary>Small helpers that create uniquely named data through the public API.</summary>
public static class TestData
{
    private static int _counter;

    /// <summary>Id of the seeded "MAIN" warehouse, set once by <see cref="ApiFixture"/>.</summary>
    public static int MainWarehouseId { get; set; }

    public static string Unique(string prefix) => $"{prefix}{Interlocked.Increment(ref _counter):000}{Guid.NewGuid().ToString("N")[..5]}";

    public static async Task<CategoryDto> CreateCategory(HttpClient admin, string? name = null)
    {
        var res = await admin.PostAsJsonAsync("/api/categories", new CategoryInput(name ?? Unique("Cat-"), null), ApiFixture.Json);
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<CategoryDto>(ApiFixture.Json))!;
    }

    public static async Task<ProductDto> CreateProduct(
        HttpClient admin, int categoryId, int openingQuantity = 0, decimal cost = 2m, decimal sale = 3m, int reorderLevel = 5)
    {
        var input = new ProductInput(
            Sku: Unique("T-").ToUpperInvariant(),
            Name: Unique("Product "),
            CategoryId: categoryId,
            Unit: "pcs",
            Location: "A-01-1",
            CostPrice: cost,
            SalePrice: sale,
            ReorderLevel: reorderLevel,
            IsActive: true,
            OpeningQuantity: openingQuantity);

        var res = await admin.PostAsJsonAsync("/api/products", input, ApiFixture.Json);
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<ProductDto>(ApiFixture.Json))!;
    }

    public static Task<HttpResponseMessage> Move(
        HttpClient client, int productId, MovementType type, int quantity, string? note = null, decimal? unitPrice = null,
        int? warehouseId = null, int? toWarehouseId = null) =>
        client.PostAsJsonAsync("/api/movements",
            new MovementInput(productId, type, quantity, unitPrice, null, null, note, null,
                warehouseId ?? MainWarehouseId, toWarehouseId), ApiFixture.Json);

    public static Task<HttpResponseMessage> Transfer(HttpClient client, int productId, int quantity, int from, int to) =>
        Move(client, productId, MovementType.TransferOut, quantity, warehouseId: from, toWarehouseId: to);

    public static async Task<ProductDto> GetProduct(HttpClient client, int id, int? warehouseId = null) =>
        (await client.GetFromJsonAsync<ProductDto>(
            $"/api/products/{id}{(warehouseId is null ? "" : $"?warehouseId={warehouseId}")}", ApiFixture.Json))!;

    public static async Task<WarehouseDto> CreateWarehouse(HttpClient admin)
    {
        var code = Unique("W")[..8].ToUpperInvariant();
        var res = await admin.PostAsJsonAsync("/api/warehouses", new WarehouseInput(code, Unique("Warehouse "), null), ApiFixture.Json);
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<WarehouseDto>(ApiFixture.Json))!;
    }

    public static async Task<string?> ErrorTitle(HttpResponseMessage res)
    {
        var body = await res.Content.ReadFromJsonAsync<Microsoft.AspNetCore.Mvc.ProblemDetails>(ApiFixture.Json);
        return body?.Title;
    }
}
