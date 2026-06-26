#import <Capacitor/Capacitor.h>

CAP_PLUGIN(SleepPlugin, "SleepPlugin",
    CAP_PLUGIN_METHOD(saveSleepStages, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(deleteAppSleepSamples, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(deleteAppQuantitySamples, CAPPluginReturnPromise);
)
