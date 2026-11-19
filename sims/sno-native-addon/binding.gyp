{
  "targets": [
    {
      "target_name": "sno_native",
      "sources": [ "addon.c" ],
      "defines": [ "NAPI_VERSION=8" ],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "Optimization": 2,
              "WholeProgramOptimization": "true"
            },
            "VCLinkerTool": {
              "LinkTimeCodeGeneration": 1
            }
          }
        }, {
          "cflags": [ "-O3", "-fvisibility=hidden" ],
          "ldflags": [ "-Wl,--strip-all" ]
        }]
      ]
    }
  ]
}
