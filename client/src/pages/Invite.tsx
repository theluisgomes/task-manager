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
import { FolderKanban, Loader2 } from "lucide-react";
import { useLocation, useParams } from "wouter";

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
  });

  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invalid invitation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              This invitation link is invalid or has expired.
            </p>
            <Button onClick={() => setLocation("/")}>Go to dashboard</Button>
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
            <p className="text-sm text-muted-foreground text-center">
              Sign in as <strong>{invite.email}</strong> to accept this invitation.
            </p>
            <div className="flex flex-col gap-2">
              {google && (
                <Button variant="outline" onClick={() => { window.location.href = getGoogleLoginUrl(); }}>
                  Sign in with Google
                </Button>
              )}
              {microsoft && (
                <Button variant="outline" onClick={() => { window.location.href = getMicrosoftLoginUrl(); }}>
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
        </CardContent>
      </Card>
    </div>
  );
}
