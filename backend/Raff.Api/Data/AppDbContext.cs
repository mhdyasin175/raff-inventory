using Microsoft.EntityFrameworkCore;
using Raff.Api.Domain;

namespace Raff.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Category>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100).IsRequired();
            e.Property(x => x.Description).HasMaxLength(300);
            e.HasIndex(x => x.Name).IsUnique();
        });

        b.Entity<Product>(e =>
        {
            e.Property(x => x.Sku).HasMaxLength(40).IsRequired();
            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
            e.Property(x => x.Unit).HasMaxLength(30).IsRequired();
            e.Property(x => x.Location).HasMaxLength(30);
            e.Property(x => x.CostPrice).HasPrecision(18, 2);
            e.Property(x => x.SalePrice).HasPrecision(18, 2);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasIndex(x => x.Sku).IsUnique();
            e.HasIndex(x => x.Name);
            e.HasOne(x => x.Category).WithMany(c => c.Products)
                .HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
            e.ToTable(t => t.HasCheckConstraint("CK_Product_Quantity", "[Quantity] >= 0"));
        });

        b.Entity<StockMovement>(e =>
        {
            e.Property(x => x.UnitPrice).HasPrecision(18, 2);
            e.Property(x => x.Party).HasMaxLength(150);
            e.Property(x => x.Reference).HasMaxLength(60);
            e.Property(x => x.Note).HasMaxLength(500);
            e.Property(x => x.Type).HasConversion<byte>();
            e.HasIndex(x => x.OccurredAt);
            e.HasIndex(x => new { x.ProductId, x.OccurredAt });
            e.HasOne(x => x.Product).WithMany(p => p.Movements)
                .HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CreatedBy).WithMany()
                .HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Role>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(60).IsRequired();
            e.Property(x => x.Description).HasMaxLength(200);
            e.HasIndex(x => x.Name).IsUnique();
        });

        b.Entity<RolePermission>(e =>
        {
            e.HasKey(x => new { x.RoleId, x.Permission });
            e.Property(x => x.Permission).HasMaxLength(60);
            e.HasOne(x => x.Role).WithMany(r => r.Permissions)
                .HasForeignKey(x => x.RoleId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<User>(e =>
        {
            e.Property(x => x.FullName).HasMaxLength(120).IsRequired();
            e.Property(x => x.Username).HasMaxLength(60).IsRequired();
            e.Property(x => x.PasswordHash).HasMaxLength(400).IsRequired();
            e.HasIndex(x => x.Username).IsUnique();
            e.HasOne(x => x.Role).WithMany(r => r.Users)
                .HasForeignKey(x => x.RoleId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
