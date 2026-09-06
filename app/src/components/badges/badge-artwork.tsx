import { buildBadgeSvgMarkup, type BadgeArtworkAssets } from '@/lib/badges/artwork';
import type { BadgeData } from '@/lib/types/models';

export function BadgeArtwork({ badge, assets }: { badge: BadgeData; assets: BadgeArtworkAssets }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 640"
      role="img"
      aria-label={`${badge.full_name} membership badge`}
      className="h-full w-full"
      dangerouslySetInnerHTML={{ __html: buildBadgeSvgMarkup(badge, assets) }}
    />
  );
}
