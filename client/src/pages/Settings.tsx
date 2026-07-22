import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, User, Shield, Bell, LogOut } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const { user, logout } = useAuth();
  const { data: prefs, refetch } = trpc.preferences.get.useQuery();
  const updatePrefs = trpc.preferences.update.useMutation({
    onSuccess: () => { refetch(); toast.success("Preferences saved"); },
  });

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account and preferences</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <User className="h-3.5 w-3.5" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center">
              <span className="text-lg font-semibold text-primary">{initials}</span>
            </div>
            <div>
              <p className="font-semibold">{user?.name ?? "User"}</p>
              <p className="text-sm text-muted-foreground">{user?.email ?? ""}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge
                  variant="secondary"
                  className={`text-[10px] h-4 px-1.5 ${
                    user?.role === "admin"
                      ? "bg-primary/10 text-primary border-0"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {user?.role === "admin" ? "Administrator" : "Member"}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Authentication</p>
              <p className="text-xs text-muted-foreground">
                Signed in via {user?.loginMethod ?? "OAuth"}
              </p>
            </div>
            <Badge variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
              Active
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Bell className="h-3.5 w-3.5" />
            Email Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="assign" className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Task assignments</span>
              <span className="text-xs text-muted-foreground font-normal">When you are assigned to a task</span>
            </Label>
            <Switch
              id="assign"
              checked={prefs?.emailOnAssignment !== false}
              disabled={updatePrefs.isPending}
              onCheckedChange={(v) => updatePrefs.mutate({ emailOnAssignment: v })}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <Label htmlFor="mention" className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Mentions</span>
              <span className="text-xs text-muted-foreground font-normal">When someone @mentions you in a comment</span>
            </Label>
            <Switch
              id="mention"
              checked={prefs?.emailOnMention !== false}
              disabled={updatePrefs.isPending}
              onCheckedChange={(v) => updatePrefs.mutate({ emailOnMention: v })}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <Label htmlFor="invite" className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Invite accepted</span>
              <span className="text-xs text-muted-foreground font-normal">When someone accepts your project invite</span>
            </Label>
            <Switch
              id="invite"
              checked={prefs?.emailOnInviteAccepted !== false}
              disabled={updatePrefs.isPending}
              onCheckedChange={(v) => updatePrefs.mutate({ emailOnInviteAccepted: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm border-destructive/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-destructive/70">
            Session
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Sign out</p>
              <p className="text-xs text-muted-foreground">End your current session</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => {
                logout();
                toast.success("Signed out successfully");
              }}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
