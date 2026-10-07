const { env } = require('../config/env');

if (env.databaseProvider === 'postgres') {
  module.exports = require('./offering.postgres');
} else {
  module.exports = {
    CatalogService: require('../models/CatalogService').CatalogService,
    Service: require('../models/Service').Service,
    Material: require('../models/Material').Material,
    MaterialCategory: require('../models/MaterialCategory').MaterialCategory,
    ServiceSuggestion: require('../models/ServiceSuggestion').ServiceSuggestion,
  };
}
