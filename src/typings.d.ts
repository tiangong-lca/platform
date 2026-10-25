declare module 'slash2';
declare module '*.css';
declare module '*.less';
declare module '*.scss';
declare module '*.sass';
declare module '*.svg';
declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.gif';
declare module '*.bmp';
declare module '*.tiff';
declare module 'numeral';
declare module '@antv/data-set';
declare module 'mockjs';
declare module 'react-fittext';
declare module 'bizcharts-plugin-slider';

declare const REACT_APP_ENV: 'test' | 'dev' | 'pre' | 'main' | 'local' | 'hosted-dev' | false;

// Authentication related type definitions
declare namespace Auth {
  type CurrentUser = {
    name?: string;
    organization?: string;
    avatar?: string;
    userid?: string;
    teamid?: string;
    email?: string;
    signature?: string;
    title?: string;
    group?: string;
    tags?: { key?: string; label?: string }[];
    notifyCount?: number;
    unreadCount?: number;
    country?: string;
    access?: string;
    geographic?: {
      province?: { label?: string; key?: string };
      city?: { label?: string; key?: string };
    };
    address?: string;
    phone?: string;
    role?: string;
    update_data_notification_time?: number;
    update_issue_notification_time?: number;
    update_team_notification_time?: number;
  };

  type LoginResult = {
    status?: string;
    type?: string;
    currentAuthority?: string;
    message?: string;
    errorCode?: string;
    errorStatus?: number;
  };

  type LoginParams = {
    email?: string;
    username?: string;
    password?: string;
    confirmPassword?: string;
    autoLogin?: boolean;
    type?: string;
  };

  type PasswordChangeParams = {
    email?: string;
    currentPassword?: string;
    confirmNewPassword?: string;
    type?: string;
  };

  type EmailChangeParams = {
    email?: string;
    newEmail?: string;
    type?: string;
  };

  type ProfileUpdateParams = {
    name?: string;
    organization?: string;
    type?: string;
  };
}
