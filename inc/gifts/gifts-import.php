<?php
/**
 * gifts.ru — Initial product import
 * Run once via WP-CLI:
 *   wp eval-file wp-content/themes/seonika-printempire/inc/gifts/gifts-import.php
 */

if ( ! class_exists( 'WP_CLI' ) ) { die( "Run via WP-CLI only.\n" ); }

set_time_limit( 0 );
ini_set( 'memory_limit', '512M' );

$log = function ( $msg ) { WP_CLI::log( $msg ); };

$log( '=== gifts.ru import started ' . date( 'Y-m-d H:i:s' ) . ' ===' );

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch URL with auth and retry. Returns string or false. */
function gifts_fetch( string $url, int $timeout = 120 ) {
    static $last_req = 0;
    // Rate-limit: max 5 req/sec
    $since = microtime( true ) - $last_req;
    if ( $since < 0.2 ) usleep( (int) ( ( 0.2 - $since ) * 1_000_000 ) );

    $ctx = stream_context_create( [
        'http' => [
            'timeout'        => $timeout,
            'ignore_errors'  => true,
        ],
        'ssl'  => [ 'verify_peer' => false ],
    ] );
    $data = @file_get_contents( $url, false, $ctx );
    $last_req = microtime( true );
    return $data;
}

/** Read a <product> node with XMLReader already positioned on it. */
function gifts_read_product_node( XMLReader $r ): array {
    $d     = [];
    $depth = $r->depth;

    while ( $r->read() ) {
        if ( $r->nodeType === XMLReader::END_ELEMENT && $r->depth <= $depth ) break;
        if ( $r->nodeType !== XMLReader::ELEMENT ) continue;

        $tag = $r->localName;

        if ( $tag === 'image' || $tag === 'img' ) {
            $r->read();
            $d['images'][] = trim( $r->value );

        } elseif ( $tag === 'images' ) {
            // descend — handled by next iterations

        } elseif ( $tag === 'property' || $tag === 'param' ) {
            $pname = $r->getAttribute( 'name' ) ?? '';
            $r->read();
            if ( $pname !== '' ) $d['props'][ $pname ] = $r->value;

        } elseif ( $tag === 'price' ) {
            // Container format: <price><product>ID</product><price>AMOUNT</price>…</price>
            // Capture only the inner <price> child; fall back to plain text for simple format.
            $reader_depth    = $r->depth;
            $all_text        = '';
            $inner_price_val = '';
            $in_inner        = false;
            while ( $r->read() ) {
                if ( $r->nodeType === XMLReader::ELEMENT && $r->localName === 'price' ) {
                    $in_inner = true;
                } elseif ( $r->nodeType === XMLReader::END_ELEMENT && $r->localName === 'price' && $r->depth > $reader_depth ) {
                    $in_inner = false;
                } elseif ( $r->nodeType === XMLReader::TEXT || $r->nodeType === XMLReader::CDATA ) {
                    $all_text .= $r->value;
                    if ( $in_inner ) $inner_price_val .= $r->value;
                }
                if ( $r->nodeType === XMLReader::END_ELEMENT && $r->depth <= $reader_depth ) break;
            }
            $price_str = $inner_price_val !== '' ? $inner_price_val : $all_text;
            if ( ! isset( $d['price'] ) ) $d['price'] = trim( $price_str );

        } else {
            $reader_depth = $r->depth;
            $val          = '';
            while ( $r->read() ) {
                if ( $r->nodeType === XMLReader::TEXT || $r->nodeType === XMLReader::CDATA ) {
                    $val .= $r->value;
                }
                if ( $r->nodeType === XMLReader::END_ELEMENT && $r->depth <= $reader_depth ) break;
            }
            if ( ! isset( $d[ $tag ] ) ) $d[ $tag ] = trim( $val );
        }
    }
    return $d;
}

// ── Step 1: Category tree → gift_cat terms ────────────────────────────────────

$log( 'Step 1: Fetching treeWithoutProducts.xml …' );

$tree_raw = gifts_fetch( GIFTS_API . '/treeWithoutProducts.xml' );
if ( ! $tree_raw ) { WP_CLI::error( 'Cannot fetch treeWithoutProducts.xml' ); }
$log( '  size: ' . number_format( strlen( $tree_raw ) ) . ' bytes' );

$tree = @simplexml_load_string( $tree_raw );
if ( ! $tree ) { WP_CLI::error( 'Cannot parse treeWithoutProducts.xml' ); }
unset( $tree_raw );

$term_map          = [];  // [gifts_page_id => wp_term_id]
$excluded_page_ids = [];  // gifts page_ids under "Маркетинговая поддержка"

function gifts_recurse_cats( $pages, int $parent_term, array &$term_map, array &$excluded ): void {
    foreach ( $pages as $page ) {
        $gid  = (int) ( isset( $page->id )   ? $page->id   : ( $page['id']   ?? 0 ) );
        $name = trim( (string) ( isset( $page->name ) ? $page->name : ( $page['name'] ?? '' ) ) );
        if ( ! $gid || $name === '' ) continue;

        if ( mb_stripos( $name, 'Маркетинговая поддержка' ) !== false ) {
            gifts_collect_excluded( $page, $excluded );
            continue;
        }

        $slug     = 'gifts-' . $gid;
        $existing = get_term_by( 'slug', $slug, 'gift_cat' );
        if ( $existing ) {
            $term_id = $existing->term_id;
            wp_update_term( $term_id, 'gift_cat', [ 'name' => $name, 'parent' => $parent_term ] );
        } else {
            $res = wp_insert_term( $name, 'gift_cat', [ 'slug' => $slug, 'parent' => $parent_term ] );
            if ( is_wp_error( $res ) ) {
                WP_CLI::warning( "  term error '$name': " . $res->get_error_message() );
                continue;
            }
            $term_id = $res['term_id'];
        }
        update_term_meta( $term_id, '_gifts_page_id', $gid );
        $term_map[ $gid ] = $term_id;

        // Recurse into children
        $children = $page->pages->page ?? $page->children->page ?? null;
        if ( $children ) {
            gifts_recurse_cats( $children, $term_id, $term_map, $excluded );
        }
    }
}

function gifts_collect_excluded( $page, array &$excluded ): void {
    $gid = (int) ( isset( $page->id ) ? $page->id : ( $page['id'] ?? 0 ) );
    if ( $gid ) $excluded[] = $gid;
    $children = $page->pages->page ?? $page->children->page ?? null;
    if ( $children ) {
        foreach ( $children as $c ) gifts_collect_excluded( $c, $excluded );
    }
}

// Detect root: <catalog><page>, <pages><page>, or root element = collection
$root_pages = $tree->page ?? $tree->pages->page ?? $tree->children();
gifts_recurse_cats( $root_pages, 0, $term_map, $excluded_page_ids );

$log( '  terms created/updated: ' . count( $term_map ) );
$log( '  excluded page IDs: ' . count( $excluded_page_ids ) );

update_option( 'gifts_term_map',       $term_map );
update_option( 'gifts_excluded_pages', $excluded_page_ids );

unset( $tree, $root_pages );

// ── Step 2: Stream product.xml ────────────────────────────────────────────────

$log( 'Step 2: Streaming product.xml (large file) …' );
$log( '  Note: building variant map first pass, then creating posts second pass.' );

$product_url  = GIFTS_API . '/product.xml';
$excluded_set = array_flip( $excluded_page_ids );
$existing_map = get_option( 'gifts_id_map', [] );  // resume support

// Pass A: collect all variants grouped by parent gifts_id
$log( '  Pass A: collecting variants …' );
$variants_map = [];  // [parent_gifts_id => [variant, …]]

$r = new XMLReader();
if ( ! @$r->open( $product_url ) ) { WP_CLI::error( 'Cannot open product.xml' ); }

while ( $r->read() ) {
    if ( $r->nodeType !== XMLReader::ELEMENT || $r->localName !== 'product' ) continue;
    $p = gifts_read_product_node( $r );

    $main = (int) ( $p['main_product'] ?? 0 );
    if ( $main <= 0 ) continue;  // not a variant

    $gid   = (int) ( $p['id'] ?? 0 );
    $price = (float) ( $p['price'] ?? 0 );
    $v     = [
        'id'     => $gid,
        'price'  => $price,
        'name'   => $p['name'] ?? '',
        'images' => $p['images'] ?? [],
    ];
    // Copy colour/size/material etc.
    foreach ( [ 'color', 'colour', 'size', 'material', 'marking', 'weight' ] as $f ) {
        if ( isset( $p[ $f ] ) && $p[ $f ] !== '' ) $v[ $f ] = $p[ $f ];
    }
    if ( ! empty( $p['props'] ) ) $v['props'] = $p['props'];

    $variants_map[ $main ][] = $v;
}
$r->close();
$log( '  variants collected for ' . count( $variants_map ) . ' parent products' );

// Pass B: create/update parent posts
$log( '  Pass B: creating parent posts …' );
$id_map  = $existing_map;
$created = 0;
$updated = 0;
$skipped = 0;

$r2 = new XMLReader();
$r2->open( $product_url );

while ( $r2->read() ) {
    if ( $r2->nodeType !== XMLReader::ELEMENT || $r2->localName !== 'product' ) continue;
    $p = gifts_read_product_node( $r2 );

    $gid      = (int) ( $p['id'] ?? 0 );
    $page_id  = (int) ( $p['page_id'] ?? 0 );
    $main     = (int) ( $p['main_product'] ?? 0 );

    if ( ! $gid )        continue;
    if ( $main > 0 )     continue;  // skip variants
    if ( isset( $excluded_set[ $page_id ] ) ) { $skipped++; continue; }

    $name        = wp_strip_all_tags( $p['name'] ?? '' );
    $description = wp_kses_post( $p['description'] ?? '' );
    $price       = (float) ( $p['price'] ?? 0 );
    $images      = $p['images'] ?? [];
    $main_image  = $images[0] ?? '';

    // Merge variants
    $variants = $variants_map[ $gid ] ?? [];

    // Min price: from variants or direct
    if ( $variants ) {
        $vprices   = array_column( $variants, 'price' );
        $min_price = $vprices ? min( $vprices ) : $price;
    } else {
        $min_price = $price;
    }

    if ( isset( $id_map[ $gid ] ) ) {
        // Update existing
        $post_id = $id_map[ $gid ];
        wp_update_post( [ 'ID' => $post_id, 'post_title' => $name, 'post_content' => $description ] );
        $updated++;
    } else {
        // Create new
        $post_id = wp_insert_post( [
            'post_title'   => $name,
            'post_content' => $description,
            'post_status'  => 'publish',
            'post_type'    => 'gift',
        ] );
        if ( is_wp_error( $post_id ) ) {
            WP_CLI::warning( "  insert error gid=$gid: " . $post_id->get_error_message() );
            continue;
        }
        $created++;
        $id_map[ $gid ] = $post_id;
    }

    // Metas
    update_post_meta( $post_id, '_gifts_id',       $gid );
    update_post_meta( $post_id, '_gifts_page_id',  $page_id );
    update_post_meta( $post_id, '_gift_price',     $min_price );
    update_post_meta( $post_id, '_gift_image',     $main_image );
    if ( count( $images ) > 1 ) {
        update_post_meta( $post_id, '_gift_images', json_encode( $images ) );
    }
    if ( $variants ) {
        update_post_meta( $post_id, '_gift_variants', json_encode( $variants ) );
    }

    // Category
    if ( isset( $term_map[ $page_id ] ) ) {
        wp_set_post_terms( $post_id, [ $term_map[ $page_id ] ], 'gift_cat' );
    }

    // Save checkpoint every 1000
    if ( ( $created + $updated ) % 1000 === 0 ) {
        update_option( 'gifts_id_map', $id_map );
        $log( "  … {$created} created, {$updated} updated, {$skipped} skipped" );
    }
}
$r2->close();

update_option( 'gifts_id_map', $id_map );

$log( "Step 2 done: created={$created} updated={$updated} skipped={$skipped}" );

// ── Step 3: Stock ─────────────────────────────────────────────────────────────

$log( 'Step 3: Loading stock.xml …' );

$stock_raw = gifts_fetch( GIFTS_API . '/stock.xml', 120 );
if ( $stock_raw ) {
    $log( '  size: ' . number_format( strlen( $stock_raw ) ) . ' bytes' );
    $stock = @simplexml_load_string( $stock_raw );
    unset( $stock_raw );

    if ( $stock ) {
        $s_items = $stock->product ?? $stock->products->product ?? null;
        $s_count = 0;
        if ( $s_items ) {
            foreach ( $s_items as $sp ) {
                $sgid = (int) ( $sp->id ?? $sp['id'] ?? 0 );
                $qty  = (int) ( $sp->quantity ?? $sp->stock ?? $sp->count ?? 0 );
                if ( $sgid && isset( $id_map[ $sgid ] ) ) {
                    update_post_meta( $id_map[ $sgid ], '_gift_stock', $qty );
                    $s_count++;
                }
            }
        }
        $log( "  stock updated: {$s_count} items" );
    } else {
        $log( '  stock.xml parse failed (non-critical)' );
    }
} else {
    $log( '  stock.xml fetch failed (non-critical)' );
}

// ── Done ──────────────────────────────────────────────────────────────────────

update_option( 'gifts_last_import', date( 'Y-m-d H:i:s' ) );

$log( '=== Import complete: created=' . $created . ' terms=' . count( $term_map ) . ' ===' );
WP_CLI::success( 'gifts.ru import finished!' );
