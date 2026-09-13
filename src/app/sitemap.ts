import type { MetadataRoute } from 'next';
import { site, tools } from '@/config';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${site.url}/`, changeFrequency: 'monthly', priority: 1 },
    ...tools.map((tool) => ({
      url: `${site.url}${tool.href}/`,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];
}