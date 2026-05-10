// EHYO — Product catalog
// Price in CHF cents (Stripe convention). Replace stripePriceId values
// with real IDs from the Stripe dashboard before going live.

export interface Product {
  id: string            // internal ID, e.g. 'drop-001'
  slug: string          // URL-friendly, e.g. 'unit-001'
  name: string          // display name, e.g. 'UNIT-001'
  description: string
  price: number         // in CHF cents (4900 = CHF 49.00)
  currency: 'CHF'
  stripePriceId: string // Stripe Price ID — replace TODO before launch
  maxStock: number      // hard cap for limited drops
  modelPath?: string    // path to .glb file for 3D viewer (optional)
  color: string         // hex accent color for slot card
}

export const products: Product[] = [
  {
    id: 'drop-001',
    slug: 'unit-001',
    name: 'UNIT-001',
    description:
      'First signal from the EHYO grid. A limited object born at the ' +
      'intersection of code and matter — 30 units, no restock. ' +
      'Authenticate your presence in the network.',
    price: 4900,
    currency: 'CHF',
    stripePriceId: 'price_TODO_replace_with_real',
    maxStock: 30,
    modelPath: undefined,
    color: '#00eaff',
  },
]

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug)
}
