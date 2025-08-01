import BDCDashboard from "@/components/BDCDashboard";
import { Button } from "@/components/ui/button";
import { LogOut, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";

const Index = () => {
  const { isAuthenticated, user, signOut } = useAuth();

  return (
    <div>
      {isAuthenticated && (
        <div className="bg-card border-b p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span className="text-sm text-muted-foreground">
              Signed in as: {user?.email}
            </span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={signOut}
            className="flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      )}
      
      <BDCDashboard />
    </div>
  );
};

export default Index;
