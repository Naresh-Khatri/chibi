import Image from "next/image";

export function GardenPoster() {
  return (
    <div className="relative h-[350px] sm:h-[470px] lg:h-[600px]">
      <Image src="/images/garden-poster.webp" alt="A miniature garden with flowers, a pond, a rabbit, and a butterfly."
        fill priority sizes="(min-width: 1024px) 60vw, 100vw" className="object-contain" />
    </div>
  );
}
