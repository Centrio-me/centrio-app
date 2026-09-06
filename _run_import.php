<?php
/**
 * Standalone import runner — executes gifts_admin_do_import() via WP context.
 * Run: php7.4 _run_import.php  (from WP root or via include path)
 */

// Adjust this path if needed
$wp_root = dirname(__FILE__);
if(!file_exists($wp_root.'/wp-load.php')){
    // Try parent dirs
    for($i=0;$i<5;$i++){
        $wp_root = dirname($wp_root);
        if(file_exists($wp_root.'/wp-load.php')) break;
    }
}

define('WP_USE_THEMES', false);
require_once $wp_root.'/wp-load.php';

if(!function_exists('gifts_admin_do_import')){
    echo "ERROR: gifts_admin_do_import() not found. Plugin may not be loaded.\n";
    // Try to load it manually
    $plugin_file = WP_CONTENT_DIR.'/plugins/pe-price-sync/pe-price-sync.php';
    if(file_exists($plugin_file)){
        require_once $plugin_file;
        echo "Plugin loaded manually.\n";
    }
    if(!function_exists('gifts_admin_do_import')){
        echo "Still not found. Check plugin.\n";
        exit(1);
    }
}

echo "=== Starting import ===\n";
echo "Time: ".date('Y-m-d H:i:s')."\n";
echo "Memory limit: ".ini_get('memory_limit')."\n\n";

set_time_limit(0);
ignore_user_abort(true);

$log   = [];
$emit  = function(string $line, bool $flush=false) use (&$log){
    $log[] = $line;
    echo $line."\n";
    flush();
    if($flush || count($log)%50===0){
        $progress = get_option('gifts_import_progress',[]);
        $progress['status'] = 'running';
        $progress['log']    = array_slice($log,-300);
        $progress['lines']  = count($log);
        update_option('gifts_import_progress',$progress);
    }
};

update_option('gifts_import_progress',[
    'status'  => 'running',
    'action'  => 'full_import',
    'started' => date('Y-m-d H:i:s'),
    'log'     => [],
    'lines'   => 0,
]);

try{
    gifts_admin_do_import($emit);
    update_option('gifts_import_progress',[
        'status'   => 'done',
        'action'   => 'full_import',
        'finished' => date('Y-m-d H:i:s'),
        'log'      => array_slice($log,-300),
        'lines'    => count($log),
    ]);
    echo "\n✅ DONE\n";
} catch(Throwable $e){
    echo "\n❌ ERROR: ".$e->getMessage()."\n";
    update_option('gifts_import_progress',[
        'status'  => 'error',
        'error'   => $e->getMessage(),
        'log'     => array_slice($log,-300),
        'lines'   => count($log),
    ]);
}
