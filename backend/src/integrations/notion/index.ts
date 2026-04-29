import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

export interface NotionChunk {
  id: string;
  text: string;
}

export async function getNotionChunks(tenantId: string): Promise<NotionChunk[]> {
  const databaseId = process.env.NOTION_DATABASE_ID!;

  const { results } = await notion.databases.query({ database_id: databaseId });

  return results
    .filter((page): page is typeof page & { id: string } => 'id' in page)
    .map(page => ({
      id: `${tenantId}::${page.id}`,
      text: extractPlainText(page),
    }))
    .filter(chunk => chunk.text.length > 0);
}

function extractPlainText(page: unknown): string {
  const p = page as Record<string, unknown>;
  const props = p['properties'] as Record<string, unknown> | undefined;
  if (!props) return '';

  return Object.values(props)
    .map(prop => {
      const p = prop as { type?: string; title?: Array<{ plain_text: string }>; rich_text?: Array<{ plain_text: string }> };
      if (p.type === 'title') return p.title?.map(t => t.plain_text).join('') ?? '';
      if (p.type === 'rich_text') return p.rich_text?.map(t => t.plain_text).join('') ?? '';
      return '';
    })
    .join(' ')
    .trim();
}
