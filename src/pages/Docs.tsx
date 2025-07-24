import { useEffect } from "react";

export default function Docs() {
  useEffect(() => {
    // Redirect to the static docs page
    window.location.replace('/docs.html');
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Redirecting to API Documentation...</h1>
        <p className="text-muted-foreground">
          If you are not redirected automatically, 
          <a href="/docs.html" className="text-primary hover:underline ml-1">
            click here
          </a>
        </p>
      </div>
    </div>
  );
}