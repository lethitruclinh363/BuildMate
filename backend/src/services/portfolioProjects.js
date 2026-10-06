const MAX_PROJECTS = 8;
const MAX_PROJECT_IMAGES = 4;
const MAX_DESCRIPTION = 500;
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const ISSUE_MESSAGE = {
  service: 'Choose a service you already registered',
  description: 'Describe each project',
  images: 'Upload at least one image for each project',
  count: 'Each project can have at most 4 images',
  limit: 'You can add up to 8 projects',
  type: 'Use a JPG, PNG, or WEBP image',
  size: 'File is too large',
};

function registeredServiceId(item) {
  if (!item) return '';
  if (item.serviceId) return String(item.serviceId);
  if (item.category && item.name) return `${item.category}::${item.name}`;
  return '';
}

function findRegisteredService(services, serviceId) {
  const wanted = String(serviceId || '').trim();
  if (!wanted) return null;
  return (services || []).find((item) => registeredServiceId(item) === wanted) || null;
}

function projectImages(project) {
  return (Array.isArray(project?.images) ? project.images : []).filter(Boolean);
}

function projectIssue(project, services) {
  if (!findRegisteredService(services, project?.serviceId)) return 'service';
  const description = String(project?.description || '').trim();
  if (!description || description.length > MAX_DESCRIPTION) return 'description';
  const images = projectImages(project);
  if (images.length < 1) return 'images';
  if (images.length > MAX_PROJECT_IMAGES) return 'count';
  return null;
}

function firstProjectIssue(profile) {
  const projects = profile?.portfolio?.projects || [];
  if (projects.length > MAX_PROJECTS) return 'limit';
  for (const project of projects) {
    const issue = projectIssue(project, profile?.services);
    if (issue) return issue;
  }
  return null;
}

function projectIssueMessage(code) {
  return ISSUE_MESSAGE[code] || 'Complete each project before continuing';
}

function imageAllowed(mime) {
  return IMAGE_MIME.has(mime);
}

module.exports = {
  MAX_PROJECTS,
  MAX_PROJECT_IMAGES,
  MAX_DESCRIPTION,
  IMAGE_MIME,
  registeredServiceId,
  findRegisteredService,
  projectIssue,
  firstProjectIssue,
  projectIssueMessage,
  imageAllowed,
};
