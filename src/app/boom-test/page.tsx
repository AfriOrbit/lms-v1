export const dynamic = 'force-dynamic';
export default async function Boom(): Promise<never> {
  throw new Error('deliberate test explosion');
}
