import { Article } from '../../types';

interface ResponsiveImageProps {
  article: Article;
  className?: string;
  containerClassName?: string;
  imageClassName?: string;
  aspectRatio?: string;
  priority?: boolean;
  grayscale?: boolean;
  hoverScale?: boolean;
}

export default function ResponsiveImage({
  article,
  className = '',
  containerClassName = '',
  imageClassName = '',
  aspectRatio = 'aspect-[16/9]',
  grayscale = true,
  hoverScale = true
}: ResponsiveImageProps) {
  const {
    image,
    mobileImage,
    mobileCropX = 50,
    mobileCropY = 50,
    mobileZoom = 100,
    desktopCropX = 50,
    desktopCropY = 50,
    desktopZoom = 100,
  } = article;

  // Mobile and desktop get their own <img> (rather than one <img> under a
  // <picture><source>) so mobileCropX/Y/Zoom and desktopCropX/Y/Zoom can
  // apply independently -- same reasoning as ArticlePage.tsx's hero.
  // hoverScale/grayscale are both md:-gated already (md:group-hover:...),
  // so applying the same effect classes to both images is safe -- each
  // only actually activates at the breakpoint it's visible in.
  //
  // The scale portion of the hover effect and the admin's configured zoom
  // both need to drive `transform`, and an inline style always wins over
  // a Tailwind utility class for the same property -- so a literal inline
  // `transform: scale(zoom)` would silently kill md:group-hover:scale-105.
  // Instead both compose via calc() over two CSS custom properties:
  // --hero-zoom (the configured value, set inline per-image) and
  // --hero-hover-zoom (1 normally, 1.05 on hover at md+, toggled by the
  // group-hover:[...] utility below).
  const effectClasses = `transition-all duration-1000 ${grayscale ? 'grayscale md:group-hover:grayscale-0' : ''} ${hoverScale ? 'md:group-hover:[--hero-hover-zoom:1.05]' : ''}`;

  return (
    <div className={`relative overflow-hidden ${aspectRatio} ${containerClassName}`}>
      {mobileImage?.url ? (
        <img
          src={mobileImage.url}
          alt={article.title}
          className={`block md:hidden w-full h-full object-cover ${effectClasses} ${imageClassName} ${className}`}
          style={{
            objectPosition: `${mobileCropX}% ${mobileCropY}%`,
            transform: 'scale(calc(var(--hero-zoom, 1) * var(--hero-hover-zoom, 1)))',
            transformOrigin: `${mobileCropX}% ${mobileCropY}%`,
            ...({ '--hero-zoom': mobileZoom / 100 } as React.CSSProperties),
          }}
          referrerPolicy="no-referrer"
        />
      ) : (
        <img
          src={image?.url || undefined}
          alt={article.title}
          className={`block md:hidden w-full h-full object-cover ${effectClasses} ${imageClassName} ${className}`}
          style={{
            objectPosition: `${mobileCropX}% ${mobileCropY}%`,
            transform: 'scale(calc(var(--hero-zoom, 1) * var(--hero-hover-zoom, 1)))',
            transformOrigin: `${mobileCropX}% ${mobileCropY}%`,
            ...({ '--hero-zoom': mobileZoom / 100 } as React.CSSProperties),
          }}
          referrerPolicy="no-referrer"
        />
      )}
      <img
        src={image?.url || undefined}
        alt={article.title}
        className={`hidden md:block w-full h-full object-cover ${effectClasses} ${imageClassName} ${className}`}
        style={{
          objectPosition: `${desktopCropX}% ${desktopCropY}%`,
          transform: 'scale(calc(var(--hero-zoom, 1) * var(--hero-hover-zoom, 1)))',
          transformOrigin: `${desktopCropX}% ${desktopCropY}%`,
          ...({ '--hero-zoom': desktopZoom / 100 } as React.CSSProperties),
        }}
        referrerPolicy="no-referrer"
      />

      {/* Editorial Overlay on Mobile for better text readability and luxury feel */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent md:hidden pointer-events-none" />

      {/* Fallback blurred background for centered portrait images on mobile if no mobile image exists */}
      {!mobileImage?.url && (
        <div className="absolute inset-0 -z-10 md:hidden overflow-hidden bg-zinc-900 pointer-events-none">
          <img
            src={image?.url || undefined}
            className="w-full h-full object-cover blur-3xl opacity-20 scale-125"
            alt=""
          />
        </div>
      )}
    </div>
  );
}
