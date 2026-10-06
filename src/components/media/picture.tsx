import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { artSrcSet, type LibraryEntry } from "@/lib/media-library";
import type { PublicImage } from "@/lib/types";

type Props = {
  /** Rendered key art or a CMS image. */
  image: LibraryEntry | PublicImage;
  sizes: string;
  alt?: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  style?: CSSProperties;
  /** Focal point override in percent, e.g. [60, 40]. */
  focal?: [number, number];
  decorative?: boolean;
};

function isArt(i: LibraryEntry | PublicImage): i is LibraryEntry {
  return "sources" in i;
}

/**
 * Responsive <picture> with AVIF → WebP fallbacks, blurred placeholder and focal-point cropping.
 * The wrapper fills its parent; size it from the outside.
 */
export function Picture({ image, sizes, alt, priority, className, imgClassName, style, focal, decorative }: Props) {
  const a = isArt(image);
  const avif = a ? artSrcSet(image, "avif") : image.avif;
  const webp = a ? artSrcSet(image, "webp") : image.webp;
  const src = a ? image.sources.webp.at(-1)!.url : image.src;
  const fp = focal ?? (a ? image.focal : [50, 50]);
  const ph = image.placeholder;
  return (
    <picture
      className={cn("block overflow-hidden", className)}
      style={{
        backgroundColor: image.color ?? undefined,
        backgroundImage: ph ? `url("${ph}")` : undefined,
        backgroundSize: "cover",
        backgroundPosition: `${fp[0]}% ${fp[1]}%`,
        ...style,
      }}
    >
      {avif && <source type="image/avif" srcSet={avif} sizes={sizes} />}
      {webp && <source type="image/webp" srcSet={webp} sizes={sizes} />}
      <img
        src={src}
        alt={decorative ? "" : (alt ?? image.alt)}
        width={image.width}
        height={image.height}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : "auto"}
        className={cn("h-full w-full object-cover", imgClassName)}
        style={{ objectPosition: `${fp[0]}% ${fp[1]}%` }}
      />
    </picture>
  );
}
