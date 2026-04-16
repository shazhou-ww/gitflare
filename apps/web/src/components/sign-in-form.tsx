import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export default function SignInForm() {
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: {
      apiKey: "",
    },
    onSubmit: async ({ value }) => {
      try {
        const response = await fetch("/api/v1/auth/token-login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ key: value.apiKey }),
        });

        if (response.ok) {
          navigate({
            to: "/dashboard",
          });
          toast.success("Sign in successful");
        } else {
          const errorData = await response.json() as { error?: string };
          toast.error(errorData.error || "Login failed");
        }
      } catch (error) {
        toast.error("Network error occurred");
      }
    },
    validators: {
      onSubmit: z.object({
        apiKey: z.string().min(1, "API key is required"),
      }),
    },
  });

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Enter your API key to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <div>
            <form.Field name="apiKey">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>API Key</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Enter your API key"
                    type="password"
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error) => (
                    <p className="text-red-500" key={error?.message}>
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            </form.Field>
          </div>

          <form.Subscribe>
            {(state) => (
              <Button
                className="w-full"
                disabled={!state.canSubmit || state.isSubmitting}
                loading={state.isSubmitting}
                type="submit"
              >
                Login
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}
