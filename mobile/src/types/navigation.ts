import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { WalletCard } from '../services/api';

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: undefined;
  Permissions: undefined;
};

export type AuthStackParamList = {
  AuthLanding: undefined;
  Login: undefined;
  Signup: undefined;
};

export type OnboardingStackParamList = {
  SimplefinOnboarding: undefined;
};

export type PermissionsStackParamList = {
  PermissionsGate: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  SwipeSmart: undefined;
  FraudAlerts: undefined;
  Chat: undefined;
};

export type DashboardStackParamList = {
  DashboardHome: undefined;
  AccountDetail: { accId: string; accType: string; provider: string };
  Settings: undefined;
  BudgetTransactions: { budgetId: string; budgetName: string };
};

export type SwipeStackParamList = {
  SwipeSmartHome: undefined;
  CardDetails: { card: WalletCard };
};

export type FraudStackParamList = {
  FraudAlertsHome: undefined;
  RecentScans: undefined;
};

// Unified type for screens that can navigate across stacks if using a global navigator,
// or for screens in specific stacks. 
// For now, we'll use a union for screens that need to navigate.
export type AppStackParamList = DashboardStackParamList & SwipeStackParamList & FraudStackParamList & AuthStackParamList;

export type DashboardNavigationProp = NativeStackNavigationProp<DashboardStackParamList>;
export type AccountDetailRouteProp = RouteProp<DashboardStackParamList, 'AccountDetail'>;
export type BudgetTransactionsRouteProp = RouteProp<DashboardStackParamList, 'BudgetTransactions'>;

export type SwipeNavigationProp = NativeStackNavigationProp<SwipeStackParamList>;
export type CardDetailsRouteProp = RouteProp<SwipeStackParamList, 'CardDetails'>;

export type FraudNavigationProp = NativeStackNavigationProp<FraudStackParamList>;

export type AuthNavigationProp = NativeStackNavigationProp<AuthStackParamList>;
