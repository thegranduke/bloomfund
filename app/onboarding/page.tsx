"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

export default function OnboardingPage() {
  const [formData, setFormData] = useState({
    walletId: "",
    plan: ""
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = () => {
    // Handle form submission
    console.log("Form data:", formData);
    // Redirect to dashboard or next step
  };

  return (
    <div className="relative flex size-full min-h-screen flex-col bg-slate-50 group/design-root overflow-x-hidden font-inter">
      <div className="layout-container flex h-full grow flex-col">
        <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-b-[#e7edf4] px-10 py-3">
          <div className="flex items-center gap-4 text-[#0d141c]">
            <div className="size-4">
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g clipPath="url(#clip0_6_319)">
                  <path
                    d="M8.57829 8.57829C5.52816 11.6284 3.451 15.5145 2.60947 19.7452C1.76794 23.9758 2.19984 28.361 3.85056 32.3462C5.50128 36.3314 8.29667 39.7376 11.8832 42.134C15.4698 44.5305 19.6865 45.8096 24 45.8096C28.3135 45.8096 32.5302 44.5305 36.1168 42.134C39.7033 39.7375 42.4987 36.3314 44.1494 32.3462C45.8002 28.361 46.2321 23.9758 45.3905 19.7452C44.549 15.5145 42.4718 11.6284 39.4217 8.57829L24 24L8.57829 8.57829Z"
                    fill="currentColor"
                  ></path>
                </g>
                <defs>
                  <clipPath id="clip0_6_319"><rect width="48" height="48" fill="white"></rect></clipPath>
                </defs>
              </svg>
            </div>
            <h2 className="text-[#0d141c] text-lg font-bold leading-tight tracking-[-0.015em]">BlockDAG Maternity</h2>
          </div>
          <div className="flex flex-1 justify-end gap-8">
            <div className="flex items-center gap-9">
              <a className="text-[#0d141c] text-sm font-medium leading-normal" href="#">Home</a>
              <a className="text-[#0d141c] text-sm font-medium leading-normal" href="#">Features</a>
              <a className="text-[#0d141c] text-sm font-medium leading-normal" href="#">Pricing</a>
              <a className="text-[#0d141c] text-sm font-medium leading-normal" href="#">Support</a>
            </div>
            <div className="flex gap-2">
              <Button className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-[#0d78f2] text-slate-50 text-sm font-bold leading-normal tracking-[0.015em] hover:bg-[#0d78f2]/90">
                <span className="truncate">Get Started</span>
              </Button>
              <Button variant="outline" className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-[#e7edf4] text-[#0d141c] text-sm font-bold leading-normal tracking-[0.015em] border-[#e7edf4] hover:bg-[#e7edf4]/90">
                <span className="truncate">Log In</span>
              </Button>
            </div>
          </div>
        </header>
        
        <div className="px-40 flex flex-1 justify-center py-5">
          <div className="layout-content-container flex flex-col w-[512px] max-w-[512px] py-5 max-w-[960px] flex-1">
            <h2 className="text-[#0d141c] tracking-light text-[28px] font-bold leading-tight px-4 text-center pb-3 pt-5">
              Welcome to BlockDAG Maternity
            </h2>
            
            <div className="flex max-w-[480px] flex-wrap items-end gap-4 px-4 py-3">
              <Label className="flex items-start text-left flex-col min-w-40 flex-1">
                <p className="text-[#0d141c] text-base font-medium leading-normal pb-2">Wallet ID</p>
                <Input
                  placeholder="Enter your wallet ID"
                  value={formData.walletId}
                  onChange={(e) => handleInputChange("walletId", e.target.value)}
                  className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-[#0d141c] focus:outline-0 focus:ring-0 border-none bg-[#e7edf4] focus:border-none h-14 placeholder:text-[#49709c] p-4 text-base font-normal leading-normal"
                />
              </Label>
            </div>
            
            <h3 className="text-[#0d141c] text-lg font-bold leading-tight tracking-[-0.015em] px-4 pb-2 pt-4">
              Select Your Support Plan
            </h3>
            
            <div className="flex flex-wrap gap-3 p-4">
              <RadioGroup 
                value={formData.plan} 
                onValueChange={(value) => handleInputChange("plan", value)}
                className="flex flex-wrap gap-3"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="basic" id="basic" className="sr-only" />
                  <Label 
                    htmlFor="basic"
                    className={`text-sm font-medium leading-normal flex items-center justify-center rounded-lg border px-4 h-11 text-[#0d141c] relative cursor-pointer transition-all ${
                      formData.plan === "basic" 
                        ? "border-[3px] px-3.5 border-[#0d78f2]" 
                        : "border-[#cedae8]"
                    }`}
                  >
                    Basic
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="premium" id="premium" className="sr-only" />
                  <Label 
                    htmlFor="premium"
                    className={`text-sm font-medium leading-normal flex items-center justify-center rounded-lg border px-4 h-11 text-[#0d141c] relative cursor-pointer transition-all ${
                      formData.plan === "premium" 
                        ? "border-[3px] px-3.5 border-[#0d78f2]" 
                        : "border-[#cedae8]"
                    }`}
                  >
                    Premium
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="family" id="family" className="sr-only" />
                  <Label 
                    htmlFor="family"
                    className={`text-sm font-medium leading-normal flex items-center justify-center rounded-lg border px-4 h-11 text-[#0d141c] relative cursor-pointer transition-all ${
                      formData.plan === "family" 
                        ? "border-[3px] px-3.5 border-[#0d78f2]" 
                        : "border-[#cedae8]"
                    }`}
                  >
                    Family
                  </Label>
                </div>
              </RadioGroup>
            </div>
            
            <div className="flex px-4 py-3 justify-center">
              <Button 
                onClick={handleSubmit}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-[#0d78f2] text-slate-50 text-sm font-bold leading-normal tracking-[0.015em] hover:bg-[#0d78f2]/90"
              >
                <span className="truncate">Continue</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
