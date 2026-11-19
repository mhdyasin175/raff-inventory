using System.Net;
using System.Net.Http.Json;
using Raff.Api.Auth;
using Raff.Api.Domain;
using Raff.Api.Dtos;

namespace Raff.Api.Tests;

[Collection("api")]
public class AuthAndPermissionTests(ApiFixture api)
{
    [Fact]
    public async Task Wrong_password_returns_401_with_a_message_in_the_requested_language()
    {
        var en = api.AnonymousClient("en");
        var ar = api.AnonymousClient("ar");

        var enRes = await en.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin", "nope"), ApiFixture.Json);
        var arRes = await ar.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin", "nope"), ApiFixture.Json);

        Assert.Equal(HttpStatusCode.Unauthorized, enRes.StatusCode);
        Assert.Equal("Wrong username or password", await TestData.ErrorTitle(enRes));
        Assert.Equal("اسم المستخدم أو كلمة المرور غير صحيحة", await TestData.ErrorTitle(arRes));
    }

    [Fact]
    public async Task Requests_without_a_token_are_rejected()
    {
        var res = await api.AnonymousClient().GetAsync("/api/products");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Login_returns_the_permissions_of_the_users_role()
    {
        var res = await api.AnonymousClient().PostAsJsonAsync("/api/auth/login", new LoginRequest("keeper", "Keeper@123"), ApiFixture.Json);
        var login = (await res.Content.ReadFromJsonAsync<LoginResponse>(ApiFixture.Json))!;

        Assert.Contains(Permissions.MovementsIn, login.User.Permissions);
        Assert.Contains(Permissions.MovementsOut, login.User.Permissions);
        Assert.DoesNotContain(Permissions.MovementsAdjust, login.User.Permissions);
        Assert.DoesNotContain(Permissions.UsersManage, login.User.Permissions);
    }

    [Fact]
    public async Task Storekeeper_can_record_stock_in_and_out_but_not_adjustments()
    {
        var admin = await api.ClientFor("admin");
        var keeper = await api.ClientFor("keeper");
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 10);

        Assert.Equal(HttpStatusCode.OK, (await TestData.Move(keeper, product.Id, MovementType.In, 2)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await TestData.Move(keeper, product.Id, MovementType.Out, 1)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await TestData.Move(keeper, product.Id, MovementType.Adjustment, 3, "count")).StatusCode);
        Assert.Equal(11, (await TestData.GetProduct(admin, product.Id)).Quantity);
    }

    [Fact]
    public async Task Auditor_can_read_but_cannot_change_anything()
    {
        var admin = await api.ClientFor("admin");
        var viewer = await api.ClientFor("viewer");
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 5);

        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync("/api/products")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync("/api/reports/category-value")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await TestData.Move(viewer, product.Id, MovementType.Out, 1)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.DeleteAsync($"/api/products/{product.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.GetAsync("/api/users")).StatusCode);
    }

    [Fact]
    public async Task Storekeeper_cannot_open_reports_or_user_management()
    {
        var keeper = await api.ClientFor("keeper");

        Assert.Equal(HttpStatusCode.Forbidden, (await keeper.GetAsync("/api/reports/category-value")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await keeper.GetAsync("/api/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await keeper.GetAsync("/api/roles")).StatusCode);
    }

    [Fact]
    public async Task The_system_admin_role_cannot_lose_permissions()
    {
        var admin = await api.ClientFor("admin");
        var roles = (await admin.GetFromJsonAsync<List<RoleDto>>("/api/roles", ApiFixture.Json))!;
        var system = roles.Single(r => r.IsSystem);

        var res = await admin.PutAsJsonAsync($"/api/roles/{system.Id}",
            new RoleInput(system.Name, system.Description, [Permissions.DashboardView]), ApiFixture.Json);

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    [Fact]
    public async Task The_last_active_admin_cannot_be_deactivated()
    {
        var admin = await api.ClientFor("admin");
        var users = (await admin.GetFromJsonAsync<List<UserDto>>("/api/users", ApiFixture.Json))!;
        var me = users.Single(u => u.Username == "admin");

        // Signed in as admin, so this hits both guards; either way it must be refused.
        var res = await admin.PutAsJsonAsync($"/api/users/{me.Id}",
            new UserUpdate(me.FullName, me.RoleId, false, null), ApiFixture.Json);

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.True((await admin.GetFromJsonAsync<List<UserDto>>("/api/users", ApiFixture.Json))!.Single(u => u.Id == me.Id).IsActive);
    }

    [Fact]
    public async Task Changing_a_roles_permissions_applies_at_the_next_sign_in()
    {
        var admin = await api.ClientFor("admin");
        var roleName = TestData.Unique("Role ");
        var created = await admin.PostAsJsonAsync("/api/roles",
            new RoleInput(roleName, null, [Permissions.DashboardView, Permissions.ProductsView]), ApiFixture.Json);
        var role = (await created.Content.ReadFromJsonAsync<RoleDto>(ApiFixture.Json))!;

        var username = TestData.Unique("u").ToLowerInvariant();
        (await admin.PostAsJsonAsync("/api/users", new UserCreate("Test user", username, "Passw0rd!", role.Id), ApiFixture.Json))
            .EnsureSuccessStatusCode();

        await admin.PutAsJsonAsync($"/api/roles/{role.Id}",
            new RoleInput(roleName, null, [Permissions.DashboardView, Permissions.ProductsView, Permissions.ReportsView]), ApiFixture.Json);

        var res = await api.AnonymousClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(username, "Passw0rd!"), ApiFixture.Json);
        var login = (await res.Content.ReadFromJsonAsync<LoginResponse>(ApiFixture.Json))!;
        Assert.Contains(Permissions.ReportsView, login.User.Permissions);
    }
}
