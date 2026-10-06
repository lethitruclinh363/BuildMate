const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  findRegisteredService,
  projectIssue,
  firstProjectIssue,
  imageAllowed,
} = require('../services/portfolioProjects');

const services = [
  { category: 'Electrical', name: 'Wiring', serviceId: 'Electrical::Wiring' },
  { category: 'Tiling', name: 'Floor tiling', serviceId: 'Tiling::Floor tiling' },
  { category: 'Painting', name: 'Interior paint', serviceId: 'Painting::Interior paint' },
];

function project(overrides) {
  return {
    serviceId: 'Tiling::Floor tiling',
    description: 'Ốp lát nền phòng khách 35m²',
    images: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'],
    ...overrides,
  };
}

describe('portfolio projects', () => {
  it('only matches services the contractor already registered', () => {
    assert.equal(findRegisteredService(services, 'Electrical::Wiring')?.name, 'Wiring');
    assert.equal(findRegisteredService(services, 'Plumbing::Pipe leak'), null);
    assert.equal(findRegisteredService(services, 'Custom tiling'), null);
  });

  it('accepts a complete project with four images', () => {
    assert.equal(projectIssue(project(), services), null);
  });

  it('rejects a fifth image', () => {
    assert.equal(projectIssue(project({ images: ['1', '2', '3', '4', '5'] }), services), 'count');
  });

  it('rejects an empty description and a project with no images', () => {
    assert.equal(projectIssue(project({ description: '   ' }), services), 'description');
    assert.equal(projectIssue(project({ images: [] }), services), 'images');
  });

  it('rejects a service that was not registered', () => {
    assert.equal(projectIssue(project({ serviceId: 'Plumbing::Pipe leak' }), services), 'service');
  });

  it('keeps two projects independent', () => {
    const profile = {
      services,
      portfolio: {
        projects: [
          project(),
          project({
            serviceId: 'Electrical::Wiring',
            description: 'Thi công lại hệ thống điện',
            images: ['e.jpg', 'f.jpg'],
          }),
        ],
      },
    };
    assert.equal(firstProjectIssue(profile), null);
    assert.equal(projectIssue(profile.portfolio.projects[0], services), null);
    assert.equal(projectIssue(profile.portfolio.projects[1], services), null);
    profile.portfolio.projects[0].images = ['a.jpg'];
    assert.equal(projectIssue(profile.portfolio.projects[1], services), null);
    assert.equal(projectIssue(profile.portfolio.projects[0], services), null);
  });

  it('allows onboarding with no projects and rejects pdf images', () => {
    assert.equal(firstProjectIssue({ services, portfolio: { projects: [] } }), null);
    assert.equal(imageAllowed('image/jpeg'), true);
    assert.equal(imageAllowed('image/png'), true);
    assert.equal(imageAllowed('image/webp'), true);
    assert.equal(imageAllowed('application/pdf'), false);
  });
});
