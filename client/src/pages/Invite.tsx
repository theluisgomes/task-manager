import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthProviders } from "@/_core/hooks/useAuthProviders";
import {
  getDevLoginUrl,
  getGoogleLoginUrl,
  getMicrosoftLoginUrl,
} from "@/const";
import { CheckCircle2, FolderKanban, Loader2 } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const { user, loading: authLoading } = useAuth();
  const { google, microsoft, oauthConfigured, devLoginAvailable } = useAuthProviders();
  const [, setLocation] = useLocation();

  const { data: invite, isLoading } = trpc.team.inviteInfo.useQuery(
    { token },
    { enabled: !!token }
  );

  const accept = trpc.team.acceptInvite.useMutation({
    onSuccess: (data) => {
      setLocation(`/projects/${data.projectId}`);
    },
    onError: (err) => {
      toast.error(err.message || "Could not accept invitation");
    },
  });

  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invite || invite.status === "invalid") {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invalid invitation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              This invitation link is invalid or has been revoked.
            </p>
            <Button onClick={() => setLocation("/")}>Go to dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invite.status === "expired") {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invitation expired</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              This invitation has expired. Ask your team admin to send a new one.
            </p>
            <Button onClick={() => setLocation("/")}>Go to dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invite.status === "accepted") {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center mb-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <CardTitle>You&apos;re in!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              You&apos;ve already joined <strong>{invite.projectName}</strong>.
            </p>
            <Button className="w-full" onClick={() => setLocation(`/projects/${invite.projectId}`)}>
              Go to project
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center mb-2">
              <FolderKanban className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle>Join {invite.projectName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p id="invite-signin-desc" className="text-sm text-muted-foreground text-center">
              Sign in as <strong>{invite.email}</strong> to accept this invitation.
            </p>
            <div className="flex flex-col gap-2" aria-describedby="invite-signin-desc">
              {google && (
                <Button variant="outline" onClick={() => { window.location.href = getGoogleLoginUrl(`/invite/${token}`); }}>
                  Sign in with Google
                </Button>
              )}
              {microsoft && (
                <Button variant="outline" onClick={() => { window.location.href = getMicrosoftLoginUrl(`/invite/${token}`); }}>
                  Sign in with Microsoft
                </Button>
              )}
              {devLoginAvailable && (
                <Button
                  className="w-full"
                  variant={oauthConfigured ? "secondary" : "default"}
                  onClick={() => { window.location.href = getDevLoginUrl(); }}
                >
                  Sign in to accept (Dev)
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const emailMatches =
    user.email?.toLowerCase() === invite.email.toLowerCase();

  if (accept.isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Join {invite.projectName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {emailMatches ? (
            <>
              <p className="text-sm text-muted-foreground">
                Signed in as <strong>{user.email}</strong>
              </p>
              <Button
                className="w-full"
                onClick={() => accept.mutate({ token })}
                disabled={accept.isPending}
              >
                Accept invitation
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                This invitation was sent to <strong>{invite.email}</strong>, but you&apos;re signed in as{" "}
                <strong>{user.email}</strong>.
              </p>
              <p className="text-sm text-muted-foreground">
                Sign out and sign in with the correct account to accept.
              </p>
              <Button className="w-full" variant="outline" onClick={() => setLocation("/")}>
                Go to dashboard
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
