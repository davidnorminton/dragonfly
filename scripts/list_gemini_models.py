#!/usr/bin/env python3
"""List available Google Gemini models."""
import sys

def list_models(api_key):
    """List Gemini models."""
    try:
        import google.generativeai as genai
        
        genai.configure(api_key=api_key)
        
        print("\nAvailable Gemini models that support generateContent:")
        print("=" * 80)
        
        audio_models = []
        other_models = []
        
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                model_info = f"  {m.name}"
                
                # Check if it's an audio model
                if 'audio' in m.name.lower() or 'native' in m.name.lower():
                    audio_models.append(model_info)
                else:
                    other_models.append(model_info)
        
        if audio_models:
            print("\n🎵 AUDIO-CAPABLE MODELS:")
            for model in audio_models:
                print(model)
        
        print("\n📝 OTHER MODELS:")
        for model in other_models[:20]:  # Limit to first 20
            print(model)
        
        if len(other_models) > 20:
            print(f"\n... and {len(other_models) - 20} more models")
        
        print("\n" + "=" * 80)
        print(f"Total: {len(audio_models)} audio models, {len(other_models)} other models")
        
    except Exception as e:
        print(f"Error listing models: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python list_gemini_models.py <API_KEY>")
        print("\nOr set GOOGLE_API_KEY environment variable:")
        print("  export GOOGLE_API_KEY='your-key-here'")
        print("  python list_gemini_models.py")
        sys.exit(1)
    
    api_key = sys.argv[1] if len(sys.argv) > 1 else None
    
    if not api_key:
        import os
        api_key = os.getenv('GOOGLE_API_KEY')
        if not api_key:
            print("Error: No API key provided")
            sys.exit(1)
    
    list_models(api_key)
