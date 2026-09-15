import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Banknote,
  Bell,
  ChartLine,
  Check,
  ChevronDown,
  Clock,
  Cloud,
  Code,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileArchive,
  FileText,
  Filter,
  Folder,
  Headphones,
  Inbox,
  Info,
  Key,
  Layers,
  LayoutGrid,
  Lock,
  LogOut,
  Mail,
  Menu,
  Megaphone,
  Minus,
  Monitor,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  SquarePen,
  Star,
  Tag,
  Trash2,
  TriangleAlert,
  Truck,
  Upload,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react';

/**
 * Icon set, backed by Lucide.
 *
 * The names are the app's own, not Lucide's, so every call site stays as it was -
 * <Icon name="cart" />. Swapping an underlying glyph is a one-line change here.
 */
const ICONS = {
  alert: TriangleAlert,
  android: Smartphone,
  archive: FileArchive,
  arrowDown: ArrowDown,
  arrowRight: ArrowRight,
  arrowUp: ArrowUp,
  bell: Bell,
  bolt: Zap,
  box: Package,
  card: CreditCard,
  cart: ShoppingCart,
  chart: ChartLine,
  check: Check,
  chevronDown: ChevronDown,
  clock: Clock,
  close: X,
  cloud: Cloud,
  code: Code,
  copy: Copy,
  download: Download,
  edit: SquarePen,
  external: ExternalLink,
  eye: Eye,
  file: FileText,
  filter: Filter,
  folder: Folder,
  gear: Settings,
  grid: LayoutGrid,
  headset: Headphones,
  inbox: Inbox,
  info: Info,
  key: Key,
  layers: Layers,
  lock: Lock,
  logout: LogOut,
  mail: Mail,
  menu: Menu,
  minus: Minus,
  money: Banknote,
  monitor: Monitor,
  phone: Phone,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  send: Send,
  megaphone: Megaphone,
  settings: Settings,
  shield: ShieldCheck,
  star: Star,
  starOutline: Star,
  tag: Tag,
  trash: Trash2,
  truck: Truck,
  upload: Upload,
  user: User,
  users: Users,
};

/** Rating stars are solid; everything else is a stroked outline. */
const FILLED = new Set(['star']);

export default function Icon({ name = 'box', className, size, style, ...rest }) {
  const Glyph = ICONS[name] || ICONS.box;

  // `size` is shorthand for width/height; an explicit `style` still wins over it
  const merged = { ...(size ? { width: size, height: size } : null), ...style };

  return (
    <Glyph
      className={className}
      style={Object.keys(merged).length ? merged : undefined}
      strokeWidth={1.8}
      absoluteStrokeWidth
      fill={FILLED.has(name) ? 'currentColor' : 'none'}
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  );
}

export const ICON_NAMES = Object.keys(ICONS);
