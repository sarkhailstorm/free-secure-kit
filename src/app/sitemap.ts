import type { MetadataRoute } from 'next';
import { site, tools, legalPages } from '@/config';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${site.url}/`, changeFrequency: 'monthly', priority: 1 },
    ...tools.map((tool) => ({
      url: `${site.url}${tool.href}/`,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    { url: `${site.url}/support/`, changeFrequency: 'monthly' as const, priority: 0.5 },
    ...legalPages.map((page) => ({
      url: `${site.url}${page.href}/`,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];
}