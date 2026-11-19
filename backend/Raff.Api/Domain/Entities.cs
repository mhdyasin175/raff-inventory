namespace Raff.Api.Domain;

public class Category
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<Product> Products { get; set; } = [];
}

public class Product
{
    public int Id { get; set; }
    public string Sku { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int CategoryId { get; set; }
    public Category Category { get; set; } = null!;

    /// <summary>Unit of measure, e.g. قطعة / كرتونة / كغ.</summary>
    public string Unit { get; set; } = "قطعة";

    /// <summary>Shelf / bin location inside the warehouse, e.g. A-03-2.</summary>
    public string? Location { get; set; }

    public decimal CostPrice { get; set; }
    public decimal SalePrice { get; set; }

    /// <summary>Current on-hand quantity. Changed only through stock movements.</summary>
    public int Quantity { get; set; }

    /// <summary>When on-hand quantity is at or below this level the product needs reordering.</summary>
    public int ReorderLevel { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    /// <summary>Optimistic concurrency token: two users moving the same product at once can't corrupt the balance.</summary>
    public byte[]? RowVersion { get; set; }

    public List<StockMovement> Movements { get; set; } = [];
}

public enum MovementType
{
    In = 1,
    Out = 2,
    Adjustment = 3
}

public class StockMovement
{
    public long Id { get; set; }
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public MovementType Type { get; set; }

    /// <summary>Signed change applied to on-hand stock (+ for In, - for Out, either for Adjustment).</summary>
    public int QuantityChange { get; set; }

    /// <summary>Stock level right after this movement was applied (useful for audit).</summary>
    public int BalanceAfter { get; set; }

    public decimal UnitPrice { get; set; }

    /// <summary>Supplier for In, customer / department for Out.</summary>
    public string? Party { get; set; }

    /// <summary>Invoice or document number.</summary>
    public string? Reference { get; set; }

    public string? Note { get; set; }
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;

    public int CreatedById { get; set; }
    public User CreatedBy { get; set; } = null!;
}

public class Role
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    /// <summary>System roles (Admin) cannot be deleted or stripped of permissions.</summary>
    public bool IsSystem { get; set; }

    public List<RolePermission> Permissions { get; set; } = [];
    public List<User> Users { get; set; } = [];
}

public class RolePermission
{
    public int RoleId { get; set; }
    public Role Role { get; set; } = null!;
    public string Permission { get; set; } = string.Empty;
}

public class User
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public int RoleId { get; set; }
    public Role Role { get; set; } = null!;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
}
