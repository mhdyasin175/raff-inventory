using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.SqlClient;
using Raff.Api.Dtos;
using Testcontainers.MsSql;

namespace Raff.Api.Tests;

/// <summary>
/// Starts one real SQL Server in Docker for the whole test run and hosts the API in memory against it.
/// Roles and the four seed users are created by the app itself; demo inventory is turned off so every
/// test builds exactly the data it asserts on.
/// </summary>
public sealed class ApiFixture : IAsyncLifetime
{
    private readonly MsSqlContainer _sql = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();

    public WebApplicationFactory<Program> Factory { get; private set; } = null!;

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    public async Task InitializeAsync()
    {
        await _sql.StartAsync();

        var cs = new SqlConnectionStringBuilder(_sql.GetConnectionString()) { InitialCatalog = "RaffTests" }.ConnectionString;

        // Environment variables are read by WebApplication.CreateBuilder before Program.cs runs,
        // so they reliably override appsettings.json (including values read at startup).
        Environment.SetEnvironmentVariable("ConnectionStrings__Default", cs);
        Environment.SetEnvironmentVariable("Seed__DemoData", "false");

        Factory = new WebApplicationFactory<Program>();
        _ = Factory.Server; // boot the app now so the schema and seed users exist before the first test

        // The seeded main warehouse is the default target of TestData.Move.
        var admin = await ClientFor("admin");
        var warehouses = await admin.GetFromJsonAsync<List<WarehouseDto>>("/api/warehouses", Json);
        TestData.MainWarehouseId = warehouses!.Single(w => w.Code == "MAIN").Id;
    }

    public async Task DisposeAsync()
    {
        await Factory.DisposeAsync();
        await _sql.DisposeAsync();
    }

    /// <summary>An HttpClient already signed in as one of the seeded users.</summary>
    public async Task<HttpClient> ClientFor(string username, string? language = null)
    {
        var client = Factory.CreateClient();
        if (language is not null) client.DefaultRequestHeaders.AcceptLanguage.ParseAdd(language);

        var password = username switch
        {
            "admin" => "Admin@123",
            "manager" => "Manager@123",
            "keeper" => "Keeper@123",
            "viewer" => "Viewer@123",
            _ => throw new ArgumentException($"Unknown seed user {username}"),
        };

        var res = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(username, password), Json);
        res.EnsureSuccessStatusCode();
        var login = (await res.Content.ReadFromJsonAsync<LoginResponse>(Json))!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.Token);
        return client;
    }

    public HttpClient AnonymousClient(string? language = null)
    {
        var client = Factory.CreateClient();
        if (language is not null) client.DefaultRequestHeaders.AcceptLanguage.ParseAdd(language);
        return client;
    }
}

[CollectionDefinition("api")]
public class ApiCollection : ICollectionFixture<ApiFixture> { }
