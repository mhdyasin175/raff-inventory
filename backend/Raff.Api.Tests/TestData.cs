using System.Net.Http.Json;
using Raff.Api.Domain;
using Raff.Api.Dtos;

namespace Raff.Api.Tests;

/// <summary>Small helpers that create uniquely named data through the public API.</summary>
public static class TestData
{
    private static int _counter;

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
        HttpClient client, int productId, MovementType type, int quantity, string? note = null, decimal? unitPrice = null) =>
        client.PostAsJsonAsync("/api/movements",
            new MovementInput(productId, type, quantity, unitPrice, null, null, note, null), ApiFixture.Json);

    public static async Task<ProductDto> GetProduct(HttpClient client, int id) =>
        (await client.GetFromJsonAsync<ProductDto>($"/api/products/{id}", ApiFixture.Json))!;

    public static async Task<string?> ErrorTitle(HttpResponseMessage res)
    {
        var body = await res.Content.ReadFromJsonAsync<Microsoft.AspNetCore.Mvc.ProblemDetails>(ApiFixture.Json);
        return body?.Title;
    }
}
