import component from './en-US/component';
import component_AISuggestion from './en-US/component_AISuggestion';
import component_allTeams from './en-US/component_allTeams';
import component_allVersions from './en-US/component_allVersions';
import component_connectableProcesses from './en-US/component_connectableProcesses';
import component_contributeData from './en-US/component_contributeData';
import importData from './en-US/component_importData';
import component_refsOfNewVersionDrawer from './en-US/component_refsOfNewVersionDrawer';
import component_rejectReview from './en-US/component_rejectReview';
import component_systemMaintenance from './en-US/component_systemMaintenance';
import component_tidasPackage from './en-US/component_tidasPackage';
import globalHeader from './en-US/globalHeader';
import menu from './en-US/menu';
import pages from './en-US/pages';
import pages_contact from './en-US/pages_contact';
import pages_flow from './en-US/pages_flow';
import pages_flowproperty from './en-US/pages_flowproperty';
import pages_general from './en-US/pages_general';
import pages_home from './en-US/pages_home';
import pages_manageSystem from './en-US/pages_manageSystem';
import pages_model from './en-US/pages_model';
import pages_process from './en-US/pages_process';
import pages_product from './en-US/pages_product';
import pages_review from './en-US/pages_review';
import pages_source from './en-US/pages_source';
import teams from './en-US/pages_teams';
import pages_unitgroup from './en-US/pages_unitgroup';
import pwa from './en-US/pwa';
import settingDrawer from './en-US/settingDrawer';
import settings from './en-US/settings';
import validator from './en-US/validator';
export default {
  'navBar.lang': 'Languages',
  'layout.user.link.help': 'Help',
  'layout.user.link.privacy': 'Privacy',
  'layout.user.link.terms': 'Terms',
  'app.preview.down.block': 'Download this page to your local project',
  'app.welcome.link.fetch-blocks': 'Get all block',
  'app.welcome.link.block-list': 'Quickly build standard, pages based on `block` development',
  ...pages,
  ...globalHeader,
  ...menu,
  ...settingDrawer,
  ...settings,
  ...pwa,
  ...component,
  ...pages_home,
  ...pages_general,
  ...pages_model,
  ...pages_process,
  ...pages_contact,
  ...pages_unitgroup,
  ...pages_flowproperty,
  ...pages_flow,
  ...pages_source,
  ...pages_product,
  ...validator,
  ...teams,
  ...component_allTeams,
  ...component_contributeData,
  ...component_allVersions,
  ...pages_manageSystem,
  ...pages_review,
  ...importData,
  ...component_tidasPackage,
  ...component_systemMaintenance,
  ...component_rejectReview,
  ...component_connectableProcesses,
  ...component_AISuggestion,
  ...component_refsOfNewVersionDrawer,
};
