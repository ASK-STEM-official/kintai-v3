import {
  LucideProps,
  Home,
  User,
  PanelLeft,
  Settings,
  Bell,
  CheckCircle2,
  XCircle,
  QrCode,
  ArrowRight,
  UserPlus,
  Clock,
  Calendar,
  BarChart,
  Users,
  LogOut,
  LogIn,
  Network,
  History,
  FilePenLine,
} from 'lucide-react';

export const Icons = {
  Home,
  User,
  PanelLeft,
  Settings,
  Bell,
  CheckCircle2,
  XCircle,
  QrCode,
  ArrowRight,
  UserPlus,
  Clock,
  Calendar,
  BarChart,
  Users,
  LogOut,
  LogIn,
  Network,
  History,
  FilePenLine,
  Logo: (props: LucideProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  ),
};
