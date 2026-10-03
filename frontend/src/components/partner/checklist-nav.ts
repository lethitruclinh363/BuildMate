export type ChecklistLink = {
  route: string;
  hash: string;
};

export const CONTRACTOR_CHECKLIST: Record<string, ChecklistLink> = {
  verification: { route: '/contractor/verification', hash: '' },
  portrait: { route: '/contractor/profile/edit', hash: '#avatar' },
  name: { route: '/contractor/profile/edit', hash: '#display-name' },
  description: { route: '/contractor/profile/edit', hash: '#introduction' },
  place: { route: '/contractor/profile/edit', hash: '#service-area' },
  hours: { route: '/contractor/profile/edit', hash: '#working-hours' },
  location: { route: '/contractor/profile/edit', hash: '#location' },
  contact: { route: '/contractor/profile/edit', hash: '#public-contact' },
  services: { route: '/contractor/services', hash: '' },
};

export const STORE_CHECKLIST: Record<string, ChecklistLink> = {
  verification: { route: '/store/verification', hash: '' },
  portrait: { route: '/store/profile/edit', hash: '#avatar' },
  name: { route: '/store/profile/edit', hash: '#store-name' },
  cover: { route: '/store/profile/edit', hash: '#cover' },
  description: { route: '/store/profile/edit', hash: '#introduction' },
  address: { route: '/store/profile/edit', hash: '#address' },
  categories: { route: '/store/materials', hash: '' },
  products: { route: '/store/products', hash: '' },
  prices: { route: '/store/prices', hash: '' },
  hours: { route: '/store/profile/edit', hash: '#working-hours' },
  location: { route: '/store/profile/edit', hash: '#location' },
  contact: { route: '/store/profile/edit', hash: '#public-contact' },
};

export function checklistDestination(link: ChecklistLink) {
  if (!link.hash) return link.route;
  return { pathname: link.route, hash: link.hash.startsWith('#') ? link.hash : `#${link.hash}` };
}
