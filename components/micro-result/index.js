const { ISSUE_TYPES } = require('../../utils/constants');

Component({
  properties: {
    issueType: { type: String, value: '' },
    result: { type: Object, value: {} }
  },
  data: { issueTypes: ISSUE_TYPES }
});
