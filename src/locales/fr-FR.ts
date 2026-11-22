import component from './fr-FR/component';
import component_AISuggestion from './fr-FR/component_AISuggestion';
import component_allTeams from './fr-FR/component_allTeams';
import component_allVersions from './fr-FR/component_allVersions';
import component_connectableProcesses from './fr-FR/component_connectableProcesses';
import component_contributeData from './fr-FR/component_contributeData';
import importData from './fr-FR/component_importData';
import component_refsOfNewVersionDrawer from './fr-FR/component_refsOfNewVersionDrawer';
import component_rejectReview from './fr-FR/component_rejectReview';
import component_systemMaintenance from './fr-FR/component_systemMaintenance';
import component_tidasPackage from './fr-FR/component_tidasPackage';
import globalHeader from './fr-FR/globalHeader';
import menu from './fr-FR/menu';
import pages from './fr-FR/pages';
import pages_contact from './fr-FR/pages_contact';
import pages_flow from './fr-FR/pages_flow';
import pages_flowproperty from './fr-FR/pages_flowproperty';
import pages_general from './fr-FR/pages_general';
import pages_home from './fr-FR/pages_home';
import pages_manageSystem from './fr-FR/pages_manageSystem';
import pages_model from './fr-FR/pages_model';
import pages_process from './fr-FR/pages_process';
import pages_product from './fr-FR/pages_product';
import pages_review from './fr-FR/pages_review';
import pages_source from './fr-FR/pages_source';
import teams from './fr-FR/pages_teams';
import pages_unitgroup from './fr-FR/pages_unitgroup';
import pwa from './fr-FR/pwa';
import settingDrawer from './fr-FR/settingDrawer';
import settings from './fr-FR/settings';
import validator from './fr-FR/validator';

export default {
  'navBar.lang': 'Langues',
  'layout.user.link.help': 'Aide',
  'layout.user.link.privacy': 'Confidentialité',
  'layout.user.link.terms': 'Conditions',
  'app.preview.down.block': 'Télécharger cette page dans votre projet local',
  'app.welcome.link.fetch-blocks': 'Obtenir tous les blocs',
  'app.welcome.link.block-list': 'Créer rapidement des pages standard à partir de composants `block`',
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
