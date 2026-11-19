using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Raff.Api.Auth;
using Raff.Api.Data;
using Raff.Api.Domain;
using Raff.Api.Dtos;
using Raff.Api.Infrastructure;

namespace Raff.Api.Controllers;

[ApiController]
[Route("api/categories")]
[Authorize]
public class CategoriesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = Permissions.ProductsView)]
    public async Task<List<CategoryDto>> GetAll() =>
        await db.Categories.AsNoTracking()
            .OrderBy(c => c.Name)
            .Select(c => new CategoryDto(c.Id, c.Name, c.Description,
                c.Products.Count(p => p.IsActive),
                c.Products.Where(p => p.IsActive).Sum(p => (decimal?)p.Quantity * p.CostPrice) ?? 0))
            .ToListAsync();

    [HttpPost]
    [Authorize(Policy = Permissions.CategoriesManage)]
    public async Task<CategoryDto> Create(CategoryInput input)
    {
        var name = input.Name.Trim();
        if (await db.Categories.AnyAsync(c => c.Name == name))
            throw AppException.Conflict(Msg.T("يوجد تصنيف بنفس الاسم", "A category with this name already exists"));

        var c = new Category { Name = name, Description = input.Description?.Trim() };
        db.Categories.Add(c);
        await db.SaveChangesAsync();
        return new CategoryDto(c.Id, c.Name, c.Description, 0, 0);
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Permissions.CategoriesManage)]
    public async Task<IActionResult> Update(int id, CategoryInput input)
    {
        var c = await db.Categories.FindAsync(id) ?? throw AppException.NotFound("التصنيف", "Category");
        var name = input.Name.Trim();
        if (await db.Categories.AnyAsync(x => x.Name == name && x.Id != id))
            throw AppException.Conflict(Msg.T("يوجد تصنيف بنفس الاسم", "A category with this name already exists"));

        c.Name = name;
        c.Description = input.Description?.Trim();
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Permissions.CategoriesManage)]
    public async Task<IActionResult> Delete(int id)
    {
        var c = await db.Categories.FindAsync(id) ?? throw AppException.NotFound("التصنيف", "Category");
        if (await db.Products.AnyAsync(p => p.CategoryId == id))
            throw AppException.Conflict(Msg.T("لا يمكن حذف تصنيف يحتوي على منتجات. انقل المنتجات أولاً", "A category with products can't be deleted. Move the products first"));

        db.Categories.Remove(c);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
