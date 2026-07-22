import { useAuth } from "@/_core/hooks/useAuth";
import { useAuthProviders } from "@/_core/hooks/useAuthProviders";
import {
  getDevLoginUrl,
  getGoogleLoginUrl,
  getMicrosoftLoginUrl,
} from "@/const";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  BarChart3,
  Calendar,
  ChevronRight,
  FolderKanban,
  Handshake,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeft,
  Settings,
  Sun,
  TrendingUp,
  Users,
} from "lucide-react";
import { CSSProperties, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { useTheme } from "@/contexts/ThemeContext";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: FolderKanban, label: "Projects", path: "/projects" },
  { icon: Handshake, label: "CRM", path: "/crm" },
  { icon: Calendar, label: "Calendar", path: "/calendar" },
  { icon: Users, label: "Team", path: "/team" },
  { icon: TrendingUp, label: "Finance", path: "/finance", badge: "Finance" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 200;
const MAX_WIDTH = 320;

function LoginScreen() {
  const { loading, google, microsoft, oauthConfigured, devLoginAvailable } =
    useAuthProviders();

  if (loading) return <DashboardLayoutSkeleton />;

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-8 p-8 max-w-sm w-full">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-lg">
            <FolderKanban className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Task Manager Pro</h1>
            <p id="login-help" className="text-sm text-muted-foreground mt-1.5">
              Project management and financial intelligence
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 w-full" aria-describedby="login-help">
          {google && (
            <Button
              onClick={() => { window.location.href = getGoogleLoginUrl(); }}
              size="lg"
              className="w-full h-11 shadow-sm"
              variant="outline"
            >
              Sign in with Google
            </Button>
          )}
          {microsoft && (
            <Button
              onClick={() => { window.location.href = getMicrosoftLoginUrl(); }}
              size="lg"
              className="w-full h-11 shadow-sm"
              variant="outline"
            >
              Sign in with Microsoft
            </Button>
          )}
          {devLoginAvailable && (
            <Button
              onClick={() => { window.location.href = getDevLoginUrl(); }}
              size="lg"
              className="w-full h-11 shadow-sm"
              variant={oauthConfigured ? "secondary" : "default"}
            >
              Sign in (Dev)
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <LoginScreen />;

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent sidebarWidth={sidebarWidth} setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  sidebarWidth,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  sidebarWidth: number;
  setSidebarWidth: (w: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const isMobile = useIsMobile();

  const activeMenuItem = menuItems.find((item) =>
    item.path === "/" ? location === "/" : location.startsWith(item.path)
  );

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Sidebar
        collapsible="icon"
        className="border-r border-border/50"
      >
        <SidebarHeader className="px-3 py-4 border-b border-border/50">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <FolderKanban className="h-4 w-4 text-primary-foreground" />
              </div>
              {!isCollapsed && (
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">Task Manager</p>
                  <p className="text-[10px] text-muted-foreground">Pro Edition</p>
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="px-2 py-3">
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={activeMenuItem?.path === item.path}
                    onClick={() => setLocation(item.path)}
                    tooltip={item.label}
                    className="h-9"
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    {item.badge && !isCollapsed && (
                      <Badge variant="secondary" className="ml-auto text-[9px] h-4 px-1">
                        {item.badge}
                      </Badge>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-2 border-t border-border/50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 w-full p-2 rounded-lg hover:bg-muted/60 transition-colors text-left">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-[10px] bg-primary/15 text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{user?.name ?? "User"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{user?.email ?? ""}</p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {toggleTheme && (
                  <DropdownMenuItem onClick={toggleTheme}>
                    {theme === "dark" ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                    {theme === "dark" ? "Light mode" : "Dark mode"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setLocation("/settings")}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>

        {!isMobile && !isCollapsed && (
          <div
            className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize hover:bg-primary/20 transition-colors"
            onMouseDown={() => setIsResizing(true)}
          />
        )}
      </Sidebar>

      <SidebarInset className="flex flex-col min-w-0">
        <header className="flex h-12 items-center gap-2 border-b border-border/50 px-4 shrink-0">
          <SidebarTrigger className="h-8 w-8">
            <PanelLeft className="h-4 w-4" />
          </SidebarTrigger>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" />
            <span>{activeMenuItem?.label ?? "Dashboard"}</span>
          </div>
        </header>
        <main id="main-content" className="flex-1 overflow-auto" tabIndex={-1}>
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
