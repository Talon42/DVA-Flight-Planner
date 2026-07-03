import { cn } from "../../components/ui/cn";
import { getAircraftGlyphSources } from "../../domain/aircraft/aircraftGlyphs.js";

// Renders a compact aircraft glyph for equipment rows and keeps the slot width stable.
export default function LogbookEquipmentGlyph({ equipment, className = "" }) {
  const glyphSources = getAircraftGlyphSources(equipment);

  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden align-middle leading-none", className)}
    >
      {glyphSources?.light ? (
        <img
          src={glyphSources.light}
          alt=""
          className="h-full w-full object-contain dark:hidden"
        />
      ) : null}
      {glyphSources?.dark ? (
        <img
          src={glyphSources.dark}
          alt=""
          className="hidden h-full w-full object-contain dark:block"
        />
      ) : null}
    </span>
  );
}
