import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/brand/icons";

type Variant = "primary" | "outline" | "gold";
type Size = "sm" | "md" | "lg";

type Common = { variant?: Variant; size?: Size; icon?: IconName; arrow?: boolean; children: ReactNode; className?: string };

function inner(children: ReactNode, variant: Variant, icon?: IconName, arrow?: boolean) {
  return (
    <>
      {variant === "primary" && <span aria-hidden className="btn-sheen" />}
      {icon && <Icon name={icon} size={17} className="-ms-0.5" />}
      <span>{children}</span>
      {arrow && <Icon name="arrow" size={16} className="btn-arrow -me-1" />}
    </>
  );
}

const cls = (variant: Variant, size: Size, className?: string) =>
  cn("btn", variant === "primary" && "btn-primary", variant === "gold" && "btn-gold", size === "sm" && "btn-sm", size === "lg" && "btn-lg", className);

/** Chamfered CTA as a link (internal routes use next/link prefetching). */
export function ButtonLink({ href, variant = "outline", size = "md", icon, arrow, children, className, ...rest }: Common & Omit<ComponentProps<typeof Link>, "children" | "className">) {
  return (
    <Link href={href} className={cls(variant, size, className)} {...rest}>
      {inner(children, variant, icon, arrow)}
    </Link>
  );
}

export function Button({ variant = "outline", size = "md", icon, arrow, children, className, type = "button", ...rest }: Common & Omit<ComponentProps<"button">, "children" | "className">) {
  return (
    <button type={type} className={cls(variant, size, className)} {...rest}>
      {inner(children, variant, icon, arrow)}
    </button>
  );
}
